export {
  createA4DocumentModel,
  A4PreviewDocument,
  type A4DocumentModel,
  type A4PreviewDocumentProps,
  // Deprecated aliases: the single A4 renderer used to live under `classic-compact` names.
  A4PreviewDocument as ResumePrintDocument,
  type A4PreviewDocumentProps as ResumePrintDocumentProps
} from "./a4-preview";
export {
  renderResumePdfBlob,
  A4DownloadDocument,
  type A4DownloadDocumentProps,
  // Deprecated aliases: the direct PDF download used to live under `native-pdf` names.
  A4DownloadDocument as ResumePdfDocument,
  type A4DownloadDocumentProps as ResumePdfDocumentProps
} from "./a4-download";
export { ResumeIconSvg } from "./resume-icon-svg";
