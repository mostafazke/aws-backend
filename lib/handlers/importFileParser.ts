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

const s3Client = new S3Client({
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

      await new Promise<void>((resolve, reject) => {
        stream
          .pipe(csv())
          .on("data", (data: Product) => {
            recordCount++;
            try {
              console.log(`Record ${recordCount}:`, {
                title: data.title,
                description: data.description,
                price: data.price,
                count: data.count,
                image: data.image,
              });

              // Validate required fields
              if (!data.title || !data.price) {
                console.warn(
                  `Record ${recordCount} missing required fields (title or price)`
                );
                errorCount++;
              }
            } catch (error) {
              console.error(`Error processing record ${recordCount}:`, error);
              errorCount++;
            }
          })
          .on("end", async () => {
            console.log(
              `Finished processing ${objectKey}. Total records: ${recordCount}, Errors: ${errorCount}`
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
