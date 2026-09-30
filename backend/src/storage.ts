import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config } from './config.js'

function client(endpoint: string) {
  return new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: config.MINIO_ACCESS_KEY, secretAccessKey: config.MINIO_SECRET_KEY },
  })
}

const storageProtocol = config.S3_SECURE ? 'https' : 'http'
export const storage = client(`${storageProtocol}://${config.MINIO_ENDPOINT}:${config.MINIO_PORT}`)
const publicStorage = client(`${storageProtocol}://${config.MINIO_PUBLIC_ENDPOINT}:${config.MINIO_PUBLIC_PORT}`)

function localPath(objectKey: string) {
  if (!objectKey.startsWith('applications/') || objectKey.includes('..')) throw new Error('Invalid object key')
  return path.resolve(config.LOCAL_UPLOAD_DIR, objectKey)
}

function uploadSignature(objectKey: string, contentType: string, expires: number) {
  return createHmac('sha256', config.TOKEN_PEPPER).update(`${objectKey}\n${contentType}\n${expires}`).digest('hex')
}

export async function ensureBucket() {
  if (config.STORAGE_DRIVER === 'local') {
    await mkdir(path.resolve(config.LOCAL_UPLOAD_DIR), { recursive: true })
    return
  }
  try {
    await storage.send(new HeadBucketCommand({ Bucket: config.MINIO_BUCKET }))
  } catch {
    await storage.send(new CreateBucketCommand({ Bucket: config.MINIO_BUCKET }))
  }
  await storage.send(new PutBucketCorsCommand({
    Bucket: config.MINIO_BUCKET,
    CORSConfiguration: {
      CORSRules: [{
        AllowedOrigins: [config.WEBSITE_ORIGIN],
        AllowedMethods: ['PUT', 'GET', 'HEAD'],
        AllowedHeaders: ['*'],
        ExposeHeaders: ['ETag'],
        MaxAgeSeconds: 3600,
      }],
    },
  }))
}

export async function headObject(objectKey: string) {
  if (config.STORAGE_DRIVER === 'local') {
    const file = localPath(objectKey)
    const [details, metadata] = await Promise.all([stat(file), readFile(`${file}.json`, 'utf8')])
    return { ContentLength: details.size, ContentType: JSON.parse(metadata).contentType as string }
  }
  return storage.send(new HeadObjectCommand({ Bucket: config.MINIO_BUCKET, Key: objectKey }))
}

export async function getObject(objectKey: string) {
  if (config.STORAGE_DRIVER === 'local') return { Body: createReadStream(localPath(objectKey)) }
  return storage.send(new GetObjectCommand({ Bucket: config.MINIO_BUCKET, Key: objectKey }))
}

export async function removeObject(objectKey: string) {
  if (config.STORAGE_DRIVER === 'local') {
    const file = localPath(objectKey)
    await Promise.all([rm(file, { force: true }), rm(`${file}.json`, { force: true })])
    return
  }
  return storage.send(new DeleteObjectCommand({ Bucket: config.MINIO_BUCKET, Key: objectKey }))
}

export async function presignedPut(objectKey: string, contentType: string) {
  if (config.STORAGE_DRIVER === 'local') {
    const expires = Math.floor(Date.now() / 1000) + 10 * 60
    const params = new URLSearchParams({ objectKey, contentType, expires: String(expires), signature: uploadSignature(objectKey, contentType, expires) })
    return `${config.API_ORIGIN}/v1/local-uploads?${params}`
  }
  return getSignedUrl(
    publicStorage,
    new PutObjectCommand({ Bucket: config.MINIO_BUCKET, Key: objectKey, ContentType: contentType }),
    { expiresIn: 10 * 60 },
  )
}

export async function acceptLocalUpload(input: {
  objectKey: string
  contentType: string
  expires: number
  signature: string
  body: Buffer
}) {
  if (config.STORAGE_DRIVER !== 'local') throw new Error('Local uploads are disabled')
  if (input.expires < Math.floor(Date.now() / 1000)) throw new Error('Upload URL expired')
  const expected = Buffer.from(uploadSignature(input.objectKey, input.contentType, input.expires), 'hex')
  const supplied = Buffer.from(input.signature, 'hex')
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new Error('Invalid upload signature')
  const file = localPath(input.objectKey)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, input.body, { flag: 'wx' })
  await writeFile(`${file}.json`, JSON.stringify({ contentType: input.contentType }), { flag: 'wx' })
}
