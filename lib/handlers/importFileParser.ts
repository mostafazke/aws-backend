import {
  S3Client,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { S3Event, S3Handler } from "aws-lambda";
import csv from "csv-parser";
import { Readable } from "stream";
import { Product } from "../../data/products";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || "us-east-1",
});

async function moveFileToProcessedFolder(
  bucketName: string,
  sourceKey: string
): Promise<void> {
  const destinationKey = sourceKey.replace("uploaded/", "parsed/");

  console.log(`Moving file from ${sourceKey} to ${destinationKey}`);

  try {
    const copyCommand = new CopyObjectCommand({
      Bucket: bucketName,
      CopySource: `${bucketName}/${sourceKey}`,
      Key: destinationKey,
    });

    await s3Client.send(copyCommand);
    console.log(`Successfully copied ${sourceKey} to ${destinationKey}`);

    const deleteCommand = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: sourceKey,
    });

    await s3Client.send(deleteCommand);
    console.log(`Successfully deleted original file ${sourceKey}`);
  } catch (error) {
    console.error(`Failed to move file ${sourceKey}:`, error);
    throw error;
  }
}

export const handler: S3Handler = async (event: S3Event) => {
  console.log("S3 Event received:", JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    try {
      const bucketName = record.s3.bucket.name;
      const objectKey = decodeURIComponent(
        record.s3.object.key.replace(/\+/g, " ")
      );

      console.log(`Processing file: ${objectKey} from bucket: ${bucketName}`);

      if (!objectKey.startsWith("uploaded/")) {
        console.log(`Skipping file ${objectKey} - not in uploaded folder`);
        continue;
      }

      if (!objectKey.toLowerCase().endsWith(".csv")) {
        console.log(`Skipping file ${objectKey} - not a CSV file`);
        continue;
      }

      const getObjectCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      });

      const response = await s3Client.send(getObjectCommand);

      if (!response.Body) {
        console.error(`No body found for object ${objectKey}`);
        continue;
      }

      console.log(
        `Successfully retrieved object ${objectKey}. Content-Length: ${response.ContentLength}`
      );

      const stream = response.Body as Readable;

      let recordCount = 0;
      let errorCount = 0;
      const sqsSendPromises: Promise<void>[] = [];
      const queueUrl = process.env.CATALOG_ITEMS_QUEUE_URL;

      if (!queueUrl) {
        console.error(
          "CATALOG_ITEMS_QUEUE_URL environment variable is not set"
        );
        return;
      }

      await new Promise<void>((resolve, reject) => {
        stream
          .pipe(csv())
          .on("data", (data: Product) => {
            recordCount++;
            try {
              const title =
                typeof data.title === "string" ? data.title.trim() : "";
              const price = Number(data.price);
              const count = data.count === undefined ? 0 : Number(data.count);

              if (!title || !Number.isFinite(price) || price <= 0) {
                console.warn(
                  `Record ${recordCount} skipped due to invalid title or price`
                );
                errorCount++;
                return;
              }

              if (!Number.isFinite(count) || count < 0) {
                console.warn(
                  `Record ${recordCount} skipped due to invalid count`
                );
                errorCount++;
                return;
              }

              const payload = {
                title,
                description:
                  typeof data.description === "string" ? data.description : "",
                price,
                count,
                ...(data.image ? { image: data.image } : {}),
              };

              sqsSendPromises.push(
                sqsClient
                  .send(
                    new SendMessageCommand({
                      QueueUrl: queueUrl,
                      MessageBody: JSON.stringify(payload),
                    })
                  )
                  .then(() => {
                    return;
                  })
                  .catch((error) => {
                    console.error(
                      `Failed to enqueue record ${recordCount} to SQS:`,
                      error
                    );
                    errorCount++;
                  })
              );
            } catch (error) {
              console.error(`Error processing record ${recordCount}:`, error);
              errorCount++;
            }
          })
          .on("end", async () => {
            try {
              await Promise.all(sqsSendPromises);
            } catch (aggregateError) {
              console.error(
                `One or more SQS send operations failed for ${objectKey}:`,
                aggregateError
              );
            }

            console.log(
              `Finished processing ${objectKey}. Total records: ${recordCount}, Successfully enqueued: ${
                recordCount - errorCount
              }, Errors: ${errorCount}`
            );

            try {
              await moveFileToProcessedFolder(bucketName, objectKey);
              console.log(`Successfully moved ${objectKey} to parsed folder`);
            } catch (moveError) {
              console.error(
                `Error moving file ${objectKey} to parsed folder:`,
                moveError
              );
            }

            resolve();
          })
          .on("error", (error: any) => {
            console.error(`Error parsing CSV ${objectKey}:`, error);
            reject(error);
          });
      });
    } catch (error) {
      console.error(`Error processing S3 record:`, error);
      console.error(`Record details:`, JSON.stringify(record, null, 2));
    }
  }

  console.log("Finished processing all S3 records");
};
