import QRCode from "qrcode";

/** PNG data URL for a QR code. Error correction M keeps modules large enough to scan from a phone screen. */
export function qrDataUrl(text: string, width = 320): Promise<string> {
  return QRCode.toDataURL(text, { errorCorrectionLevel: "M", margin: 1, width });
}
