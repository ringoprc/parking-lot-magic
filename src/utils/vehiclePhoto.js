export const VEHICLE_PHOTO_SLOTS = [
  { key: 'frontLeft', label: '左前方', hint: '車頭與左側車身' },
  { key: 'frontRight', label: '右前方', hint: '車頭與右側車身' },
  { key: 'rearLeft', label: '左後方', hint: '車尾與左側車身' },
  { key: 'rearRight', label: '右後方', hint: '車尾與右側車身' },
];

export const normalizePlate = value => value.normalize('NFKC').trim().toUpperCase().replace(/\s/g, '');

// Bound the complete four-photo request below the hosting proxy's request limit.
// Canvas exports pixels only, so original GPS/EXIF metadata is not uploaded.
export async function prepareVehiclePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('請選擇 JPG、PNG 或 WebP 照片；HEIC 請先轉為 JPG。');
  }
  if (file.size > 10 * 1024 * 1024) throw new Error('每張照片需小於 10 MB，請選擇較小的照片。');
  let bitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error('無法讀取這張照片，請重新選擇。'); }
  try {
    const canvas = document.createElement('canvas');
    const ratio = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('瀏覽器無法處理照片，請更新瀏覽器後重試。');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.65, 0.45]) {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
      if (blob && blob.type === 'image/webp' && blob.size <= 600 * 1024) {
        return new File([blob], 'vehicle.webp', { type: 'image/webp' });
      }
    }
    throw new Error('照片處理失敗，請改用較小的照片。');
  } finally { bitmap.close(); }
}
