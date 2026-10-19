export function getImageCrop(width, height, ratio, zoom = 1, center = { x: 0.5, y: 0.5 }) {
  const cropWidth = Math.min(width, height * ratio) / Math.max(1, zoom);
  const cropHeight = cropWidth / ratio;
  const x = Math.max(0, Math.min(width - cropWidth, center.x * width - cropWidth / 2));
  const y = Math.max(0, Math.min(height - cropHeight, center.y * height - cropHeight / 2));
  return { x, y, width: cropWidth, height: cropHeight };
}

export function moveImageCrop(width, height, crop, dx, dy) {
  return {
    x: Math.max(crop.width / 2, Math.min(width - crop.width / 2, crop.x + crop.width / 2 + dx)) / width,
    y: Math.max(crop.height / 2, Math.min(height - crop.height / 2, crop.y + crop.height / 2 + dy)) / height,
  };
}

export function drawImageCrop(image, crop, maxEdge = 1600) {
  const scale = Math.min(1, maxEdge / Math.max(crop.width, crop.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(crop.width * scale));
  canvas.height = Math.max(1, Math.round(crop.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("瀏覽器無法處理圖片，請重新開啟頁面後再試");
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}
