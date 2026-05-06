export interface ImageUploadOptions {
  folder: string;
  transformation?: Record<string, unknown>[];
}

/**
 * 上传图片到 Cloudinary，未配置 Cloudinary 时退回为 base64 Data URL。
 *
 * @param buffer 图片二进制内容。
 * @param mimeType 图片 MIME 类型。
 * @param options 上传配置。
 * @returns 可直接用于前端展示的图片地址。
 */
export async function uploadImage(
  buffer: Buffer,
  mimeType: string,
  options: ImageUploadOptions
): Promise<string> {
  const hasCloudinary =
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET;

  if (!hasCloudinary) {
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  }

  const { v2: cloudinary } = await import("cloudinary");
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        folder: options.folder,
        transformation: options.transformation,
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary upload failed"));
          return;
        }

        resolve((result as { secure_url: string }).secure_url);
      }
    ).end(buffer);
  });
}
