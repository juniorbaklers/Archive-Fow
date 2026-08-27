declare module "libarchive.js" {
  type ExtractedItem={file:File;path:string};
  type ArchiveReader={hasEncryptedData():Promise<boolean|null>;usePassword(password:string):Promise<void>;extractFiles():Promise<Record<string,unknown>>;getFilesArray():Promise<ExtractedItem[]>;close():Promise<void>};
  export const Archive:{init(options:{workerUrl:string}):void;open(file:File):Promise<ArchiveReader>};
}
