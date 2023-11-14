import { PluginSystem } from "../../../plugin";
import puppeteer, { Browser, registerCustomQueryHandler } from "puppeteer";
import axios from "axios";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import {
  AbilityResponseHelperInterface,
  AmqpGolemMessage,
  ChatAbilityInterface,
  LoggerServiceInterface,
  ServicesConstructorInterface,
  SocketMessage,
  SpellbookServiceInterface,
  VaultServiceInterface,
} from "types";
import ChatAbilityBase from "../../spellbook/prompt/chat.ability.base";

class NewsSkill extends ChatAbilityBase implements ChatAbilityInterface {
  private spellbookService: SpellbookServiceInterface;
  private vaultService: VaultServiceInterface;
  private responseClass: AbilityResponseHelperInterface;
  private readonly endpoint: string;
  jobsBuffer: any;

  constructor(services: ServicesConstructorInterface) {
    super(services);
    this.spellbookService = services["SpellbookService"];
    this.vaultService = services["VaultService"];
    this.endpoint = "https://api.bing.microsoft.com/v7.0/news/search";
    this.jobsBuffer = {};
  }

  async getReadableContent(url, browser) {
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "networkidle2" });

      const response = await page.content();
      const doc = new JSDOM(response, {
        url,
        contentType: "text/html",
      }).window.document;

      const reader = new Readability(doc);
      const article = reader.parse();
      article.textContent = article.textContent
        .replace(/^[\t ]+/gm, "")
        .replace(/\n\s*\n\s*\n+/g, "\n\n")
        .trim();
      return article;
    } catch (ex) {
      this.logger.error(`error getting news from ${url}`);
    }
    return null;
  }

  async searchNews(
    topic: string,
    apiKey: string,
    numArticles: number
  ): Promise<any> {
    try {
      const response = await axios.get(this.endpoint, {
        params: {
          q: topic,
          count: numArticles,
        },
        headers: {
          "Ocp-Apim-Subscription-Key": apiKey,
        },
      });

      if (response.status === 200)
        return { response: response.data, error: null };

      if (response.statusText == "PermissionDenied")
        return { response: null, error: "invalid api key" };
    } catch (ex) {
      const error =
        ex.response.statusText == "PermissionDenied"
          ? "invalid API key"
          : "unknown error";
      return { response: null, error: error };
    }
  }

  @PluginSystem
  async executeSkill(
    socketMessage: SocketMessage,
    skillData: any,
    responseClass: AbilityResponseHelperInterface
  ): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      try {
        this.responseClass = responseClass;
        const skillConfig = await this.vaultService.getGroup(
          "chat_ability/bing_news"
        );

        if (!socketMessage || !socketMessage.socket_id) {
          this.logger.error(`invalid socket message`);
          resolve(false);
          return;
        }

        if (!skillConfig || !skillConfig.api_key) {
          await responseClass.sendError(
            `No API key configured for Bing news.`,
            socketMessage.socket_id
          );
          this.logger.error(`no api key configured for bing news`);
          resolve(false);
          return;
        }

        let numArticles = !skillConfig.num_articles
          ? 5
          : skillConfig.num_articles;
        numArticles = skillConfig.num_articles || numArticles;
        numArticles = numArticles > 10 ? 10 : numArticles;

        const topic = skillData.topic;
        this.logger.info(`Running news search for ${topic}`, {
          icon: "🗞️",
        });

        const { response, error } = await this.searchNews(
          topic,
          skillConfig.api_key,
          numArticles
        );
        if (!response) {
          await responseClass.sendError(
            `Error searching for news on topic ${topic}, ${error}.`,
            socketMessage.socket_id
          );
          resolve(false);
          return;
        }

        const browser = await puppeteer.launch({
          headless: "new",
          args: [
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--disable-setuid-sandbox",
            "--no-first-run",
            "--no-sandbox",
            "--no-zygote",
            "--deterministic-fetch",
            "--disable-features=IsolateOrigins",
            "--disable-site-isolation-trials",
          ],
        });

        const onlineSummarizer =
          this.spellbookService.getOnlineSkillFromKey("openai_gpt_35");

        const newJob = {
          articles: [],
          bingResults: response,
          resolve: resolve,
          reject: reject,
          browser: browser,
          summarize: onlineSummarizer ? true : false,
        };

        let articleHeader =
          '<div class="card mt-2 mb-4 ml-6 mr-6 pt-3 pb-0 pl-0 flex grid">';
        for (let i = 0; i < response.value.length; i++) {
          const currentNews = response.value[i];

          // display at top
          const articleHeaderPart = `<div class="col-1 pl-3 pt-0 flex align-content-center">
          <img src="${currentNews.image.thumbnail.contentUrl}" style="padding-top: 5px; height: fit-content" width="100%"/>
        </div>
        <div class="col-11 pl-0 pt-0 flex" style="flex-direction: column">
          <h4 class="mb-2">${currentNews.name}</h4>
          <p>${currentNews.description}</p>
          <p><a href="${currentNews.url}" target="_blank">Read article on ${currentNews.provider[0].name}</a></p>              
        </div>`;

          const html = `<div class="card mt-2 mb-4 ml-6 mr-6 pt-3 pb-0 pl-0 flex grid">
            <div class="col-1 pl-3 pt-0 flex align-content-center">
              <img src="${currentNews.image.thumbnail.contentUrl}" style="padding-top: 5px; height: fit-content" width="100%"/>
            </div>
            <div class="col-11 pl-0 pt-0 flex" style="flex-direction: column">
              <h4 class="mb-2">${currentNews.name}</h4>
              <p>{{cursor}}</p>          
            </div>
          </div>`;

          articleHeader += articleHeaderPart;
          newJob.articles.push({
            display: html,
            content: null,
            url: currentNews.url,
            description: currentNews.description,
          });
        }
        articleHeader += "</div>";

        // send the results to client right away
        await responseClass.sendResponse(
          articleHeader,
          null,
          socketMessage.socket_id
        );
        this.jobsBuffer[socketMessage.socket_id] = newJob;
        this.processNextArticle(socketMessage.socket_id);
      } catch (error) {
        this.logger.error(`error getting news`, null, error);
        resolve(true);
      }
    });
  }

  @PluginSystem
  async processArticleSummary(message: AmqpGolemMessage) {
    const headers = message.properties.headers;
    const job = this.jobsBuffer[headers.socket_id];
    if (message.content.indexOf('"content": "<fragment>"') == -1) {
      return true;
    }

    if (!job || !job.articles) {
      return true;
    }
    await this.responseClass.resetCursor(headers.socket_id);
    await this.processNextArticle(headers.socket_id);
  }

  @PluginSystem
  async updateProgressBar(socketId, label) {
    const currentValue = label.length ? -1 : 101;
    // show progress bar while getting webpage
    this.responseClass.updateProgressBar(
      {
        label: label,
        total: 100,
        current: currentValue,
      },
      socketId
    );
  }

  @PluginSystem
  async processNextArticle(socketId: string): Promise<boolean> {
    const currentJob = this.jobsBuffer[socketId];
    if (!currentJob) {
      return false;
    }

    // start to get the content of the articles
    let allDone = true;
    for (let i = 0; i < currentJob.articles.length; i++) {
      const currentNews = currentJob.articles[i];
      if (currentNews.content) {
        continue;
      }
      if (i > 0) this.updateProgressBar(socketId, "");
      this.updateProgressBar(socketId, `Reading Article #${i + 1}`);

      allDone = false;
      let newsContent = null;
      try {
        newsContent = await this.getReadableContent(
          currentNews.url,
          currentJob.browser
        );
      } catch (ex) {
        this.logger.error(`error getting content for ${currentNews.url}`);
        newsContent = null;
      }

      // got the news content so start summary
      if (
        newsContent &&
        newsContent.textContent.length >= currentNews.description.length
      ) {
        if (!currentJob.summarize) {
          const newDisplay = currentNews.display.replace(
            "{{cursor}}",
            newsContent.textContent
          );
          await this.responseClass.sendResponse(
            newDisplay,
            newDisplay,
            socketId
          );
          this.updateProgressBar(socketId, "");
          if (i == currentJob.articles.length - 1) {
            allDone = true;
            break;
          }
          continue;
        }

        currentNews.content = newsContent.textContent;
        await this.responseClass.sendResponseWithCursor(
          currentNews.display,
          "{{cursor}}",
          socketId
        );
        this.updateProgressBar(socketId, "");

        // send command to llm to summarize
        const payload = this.responseClass.simpleChatPayload(
          "Read the user message and give a detailed summary of the news article they provide. The summary show be at least one third as long as the original article.",
          newsContent.textContent
        );

        const ret = await this.spellbookService.publishCommand(
          "golem_skill",
          "openai_gpt_35",
          "prompt_response",
          {
            stream: true,
            messages: payload,
            stop_key: "<fragment>",
          },
          {
            job: "summarize_news_article",
            socket_id: socketId,
          }
        );
        break;
      } else {
        // scan skip rendering as header already include all info we have
        currentNews.content = "";
        if (i == currentJob.articles.length - 1) {
          allDone = true;
          break;
        }
      }
    }

    if (allDone) {
      try {
        await currentJob.browser?.close();
      } catch (ex) {
        this.logger.error(`error closing browser`);
      }
      currentJob.resolve(true);
    }
    return true;
  }
}

export default NewsSkill;
