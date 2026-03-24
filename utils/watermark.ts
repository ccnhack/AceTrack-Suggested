import { PDFDocument, rgb, degrees } from 'pdf-lib';

export const applyWatermark = async (file: File): Promise<string> => {
  if (file.type.startsWith('image/')) {
    return await watermarkImage(file);
  } else if (file.type === 'application/pdf') {
    return await watermarkPDF(file);
  } else {
    // For other types, just return the base64 (or throw error)
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
};

const watermarkImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(e.target?.result as string);

        ctx.drawImage(img, 0, 0);

        // Apply watermark
        ctx.font = `${Math.max(20, canvas.width / 15)}px Arial`;
        ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Rotate and draw multiple times
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(-Math.PI / 4);
        
        // Draw a grid of watermarks
        const step = Math.max(150, canvas.width / 4);
        for (let x = -canvas.width; x < canvas.width; x += step) {
          for (let y = -canvas.height; y < canvas.height; y += step) {
            ctx.fillText('ACETRACK', x, y);
          }
        }

        resolve(canvas.toDataURL(file.type));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const watermarkPDF = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const pages = pdfDoc.getPages();

    for (const page of pages) {
      const { width, height } = page.getSize();
      const fontSize = Math.max(20, width / 15);
      
      const step = Math.max(150, width / 4);
      for (let x = -width; x < width * 2; x += step) {
        for (let y = -height; y < height * 2; y += step) {
          page.drawText('ACETRACK', {
            x,
            y,
            size: fontSize,
            color: rgb(1, 0, 0),
            opacity: 0.3,
            rotate: degrees(-45),
          });
        }
      }
    }

    const pdfBytes = await pdfDoc.saveAsBase64({ dataUri: true });
    return pdfBytes;
  } catch (error) {
    console.error('Error watermarking PDF:', error);
    // Fallback to base64 without watermark if it fails
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
};
