import { createClient } from "redis";
import { SchemaFieldTypes } from "@redis/search";

class EmbeddingManager {
  private client;
  //private searchClient;

  constructor(redisUrl: string) {
    this.client = createClient({
      url: redisUrl,
    });

    this.client.on("error", (err) => console.log("Redis Client Error", err));
    this.client.connect();
  }

  async createIndex(indexName: string, dims: number): Promise<void> {
    try {
      await this.client.create(indexName, {
        "$.embedding": SchemaFieldTypes.VECTOR,
        embedding: {
          type: "FLAT",
          dims: dims,
          distanceMetric: "COSINE",
        },
      });
      console.log(`Index ${indexName} created successfully.`);
    } catch (error) {
      console.error(`Error creating index ${indexName}:`, error);
    }

    /*
    await client.ft.create('idx:animals', {
        name: {
            type: SchemaFieldTypes.TEXT,
            SORTABLE: true
        },
        species: SchemaFieldTypes.TAG,
        age: SchemaFieldTypes.NUMERIC
        }, {
        ON: 'HASH',
        PREFIX: 'noderedis:animals'
        });*/
  }

  async addEmbedding(
    indexName: string,
    docId: string,
    embedding: number[]
  ): Promise<void> {
    try {
      await this.client.json.set(`${indexName}:${docId}`, "$", { embedding });
      console.log(`Embedding added to ${indexName} with ID ${docId}`);
    } catch (error) {
      console.error(`Error adding embedding to ${indexName}:`, error);
    }
  }

  async searchEmbeddings(
    indexName: string,
    queryEmbedding: number[],
    topK: number = 10
  ): Promise<any> {
    try {
      const results = await this.client.ft.search(
        indexName,
        `@embedding:[${queryEmbedding.join(",")}]->[KNN ${topK}]`,
        {
          RETURN: 3,
          RETURN_FIELDS: ["id", "score", "payload"],
        }
      );
      console.log(`Found ${results.total} results.`);
      return results.documents;
    } catch (error) {
      console.error(`Error searching in index ${indexName}:`, error);
      return null;
    }
  }
}

export default EmbeddingManager;
