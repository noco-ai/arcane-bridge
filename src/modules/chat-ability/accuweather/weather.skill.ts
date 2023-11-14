import axios from "axios";
import ChatAbilityBase from "../../spellbook/prompt/chat.ability.base";
import {
  AbilityResponseHelperInterface,
  ChatAbilityInterface,
  ServicesConstructorInterface,
  SocketMessage,
  SpellbookServiceInterface,
  VaultServiceInterface,
} from "types";

class WeatherSkill extends ChatAbilityBase implements ChatAbilityInterface {
  private spellbookService: SpellbookServiceInterface;
  private vaultService: VaultServiceInterface;
  private apiKey: string;

  constructor(services: ServicesConstructorInterface) {
    super(services);
    this.spellbookService = services["SpellbookService"];
    this.vaultService = services["VaultService"];
  }

  async searchCity(query: string, responseClass, socketId) {
    try {
      const response = await axios.get(
        `http://dataservice.accuweather.com/locations/v1/cities/search?apikey=${this.apiKey}&q=${query}`
      );

      // save the response to a DB table and do a search
      if (!Array.isArray(response.data)) {
        return null;
      }
      return response.data[0];
    } catch (error) {
      const errorStr =
        error.response.status == 401
          ? `The API key provided to AccuWeather.com is not valid.`
          : `An unknown error occurred with the AccuWeather.com API`;
      await responseClass.sendError(errorStr, socketId);
    }
    return null;
  }

  async getCurrentConditions(locationKey: string, responseClass, socketId) {
    try {
      const response = await axios.get(
        `http://dataservice.accuweather.com/currentconditions/v1/${locationKey}?apikey=${this.apiKey}`
      );
      return response.data;
    } catch (error) {
      const errorStr =
        error.response.status == 401
          ? `The API key provided to AccuWeather.com is not valid.`
          : `An unknown error occurred with the AccuWeather.com API`;
      await responseClass.sendError(errorStr, socketId);
    }
    return null;
  }

  async getForecast(
    locationKey: string,
    forecastType: "1day" | "5day" | "10day" | "15day",
    responseClass,
    socketId
  ) {
    try {
      const response = await axios.get(
        `http://dataservice.accuweather.com/forecasts/v1/daily/${forecastType}/${locationKey}?apikey=${this.apiKey}`
      );
      return response.data;
    } catch (error) {
      const errorStr =
        error.response.status == 401
          ? `The API key provided to AccuWeather.com is not valid.`
          : `An unknown error occurred with the AccuWeather.com API`;
      await responseClass.sendError(errorStr, socketId);
    }
    return null;
  }

  async executeSkill(
    socketMessage: SocketMessage,
    skillData: any,
    responseClass: AbilityResponseHelperInterface
  ): Promise<boolean> {
    // get config data
    const skillConfig = await this.vaultService.getGroup(
      "chat_ability/accuweather"
    );
    if (skillConfig && skillConfig.api_key) {
      this.apiKey = skillConfig.api_key;
    }

    if (!this.apiKey) {
      await responseClass.sendError(
        `No API key AccuWeather.com is configured.`,
        socketMessage.socket_id
      );
      return true;
    }

    // use default in no location was passed in
    if (!skillData || (!skillData.location && skillConfig.default_location)) {
      skillData = { location: skillConfig.default_location };
    }

    // no location was sent with request and no default is set.
    if (!skillData.location) {
      await responseClass.sendError(
        `No default location is configured for current weather`,
        socketMessage.socket_id
      );
      return true;
    }

    this.logger.info(`Getting current weather for ${skillData.location}`, {
      icon: "🌞",
    });

    const location = await this.searchCity(
      skillData.location,
      responseClass,
      socketMessage.socket_id
    );
    if (!location) {
      return true;
    }

    const currentWeather = await this.getCurrentConditions(
      location.Key,
      responseClass,
      socketMessage.socket_id
    );
    if (!currentWeather) {
      return true;
    }

    const json = currentWeather[0];
    const iconName = String(json.WeatherIcon).padStart(2, "0");
    const html = `<div class="card mt-2 mb-2 md:ml-6 md:mr-6 pt-3 pb-0 pl-0 flex grid sm:ml-0 sm:mr-0">
      <div class="md:col-1 pl-0 pt-0 flex align-content-center sm:col-2">
        <img src="https://developer.accuweather.com/sites/default/files/${iconName}-s.png"/>
      </div>
      <div class="md:col-10 pl-0 pt-0 flex sm:col-8" style="flex-direction: column">
        <h3>${location.LocalizedName}, ${location.AdministrativeArea.LocalizedName}</h3>
        <p>${json.WeatherText}</p>
      </div>
      <h2 class="md:col-1 pt-0 sm:col-2">${json.Temperature.Imperial.Value}°${json.Temperature.Imperial.Unit}</h2>
    </div>`;
    const textOnly =
      `The current weather in ${location.LocalizedName}, ${location.AdministrativeArea.LocalizedName} is ` +
      `${json.WeatherText}. It is currently ${json.Temperature.Imperial.Value}°${json.Temperature.Imperial.Unit} degrees.`;

    return await responseClass.sendResponse(
      html,
      textOnly,
      socketMessage.socket_id
    );
  }
}

export default WeatherSkill;
