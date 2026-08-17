import { CardTemplateTheme, CardAspectRatio } from "./types";

export interface CardCanvasOptions {
  title: string;
  description?: string;
  sourceName?: string;
  imageUrl?: string | null;
  theme: CardTemplateTheme;
  aspectRatio: CardAspectRatio;
}

export function drawCardToCanvas(canvas: HTMLCanvasElement, options: CardCanvasOptions): Promise<void> {
  return new Promise((resolve) => {
    const { title, description = "", sourceName = "NEWS", imageUrl, theme, aspectRatio } = options;
    const ctx = canvas.getContext("2d");
    if (!ctx) return resolve();

    // Canvas size calculation
    const width = 1080;
    const height = aspectRatio === "4:5" ? 1350 : 1080;

    canvas.width = width;
    canvas.height = height;

    // Theme style definitions
    let bgColor = "#12131A";
    let textColor = "#FFFFFF";
    let subTextColor = "#9A9CAF";
    let accentColor = "#7C5CFF";
    let badgeBg = "rgba(124, 92, 255, 0.2)";
    let badgeText = "#B8A6FF";
    let cardBg = "#1C1E2B";

    if (theme === "cream") {
      bgColor = "#F6F4EE";
      textColor = "#1F2024";
      subTextColor = "#636573";
      accentColor = "#E65100";
      badgeBg = "#EAE6D8";
      badgeText = "#D84315";
      cardBg = "#FFFFFF";
    } else if (theme === "neon") {
      bgColor = "#080B10";
      textColor = "#FFFFFF";
      subTextColor = "#8F9CAE";
      accentColor = "#CCFF00";
      badgeBg = "rgba(204, 255, 0, 0.15)";
      badgeText = "#CCFF00";
      cardBg = "#111622";
    } else if (theme === "pastel") {
      bgColor = "#F4EFFA";
      textColor = "#2B2438";
      subTextColor = "#746985";
      accentColor = "#FF6FB5";
      badgeBg = "#E5D8F6";
      badgeText = "#9C27B0";
      cardBg = "#FFFFFF";
    }

    // 1. Background Fill
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // Decorative gradient pattern
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, `${accentColor}18`);
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Helper: draw image or image placeholder
    const renderCard = (imgObj?: HTMLImageElement) => {
      const margin = 64;
      const topPadding = 80;
      let currentY = topPadding;

      // Header Tag / Source badge
      ctx.font = "bold 24px sans-serif";
      const sourceText = `● ${sourceName.toUpperCase()}`;
      const sourceWidth = ctx.measureText(sourceText).width + 36;
      const sourceHeight = 44;

      ctx.fillStyle = badgeBg;
      ctx.beginPath();
      ctx.roundRect(margin, currentY, sourceWidth, sourceHeight, 22);
      ctx.fill();

      ctx.fillStyle = badgeText;
      ctx.fillText(sourceText, margin + 18, currentY + 29);

      currentY += sourceHeight + 40;

      // Article Image Section
      const imageAreaHeight = aspectRatio === "4:5" ? 540 : 420;
      const imageWidth = width - margin * 2;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(margin, currentY, imageWidth, imageAreaHeight, 28);
      ctx.clip();

      if (imgObj && imgObj.complete && imgObj.naturalWidth > 0) {
        // Draw image cover mode
        const scale = Math.max(imageWidth / imgObj.naturalWidth, imageAreaHeight / imgObj.naturalHeight);
        const x = margin + (imageWidth - imgObj.naturalWidth * scale) / 2;
        const y = currentY + (imageAreaHeight - imgObj.naturalHeight * scale) / 2;
        ctx.drawImage(imgObj, x, y, imgObj.naturalWidth * scale, imgObj.naturalHeight * scale);
      } else {
        // Fallback Card Pattern
        ctx.fillStyle = cardBg;
        ctx.fillRect(margin, currentY, imageWidth, imageAreaHeight);
        ctx.fillStyle = accentColor;
        ctx.font = "bold 64px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("NEWS", width / 2, currentY + imageAreaHeight / 2 + 20);
        ctx.textAlign = "left";
      }
      ctx.restore();

      currentY += imageAreaHeight + 48;

      // Title Drawing (Multi-line wrap)
      ctx.fillStyle = textColor;
      ctx.font = "bold 44px sans-serif";
      const maxTitleWidth = width - margin * 2;
      const words = title.split(" ");
      let line = "";
      const lines: string[] = [];
      const lineHeight = 58;

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + " ";
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxTitleWidth && n > 0) {
          lines.push(line.trim());
          line = words[n] + " ";
        } else {
          line = testLine;
        }
      }
      lines.push(line.trim());

      // Limit max 3 lines for title
      const titleLinesToShow = lines.slice(0, 3);
      titleLinesToShow.forEach((l, idx) => {
        if (idx === 2 && lines.length > 3) {
          ctx.fillText(l + "...", margin, currentY);
        } else {
          ctx.fillText(l, margin, currentY);
        }
        currentY += lineHeight;
      });

      currentY += 12;

      // Description Drawing (Multi-line)
      if (description) {
        ctx.fillStyle = subTextColor;
        ctx.font = "normal 28px sans-serif";
        const descWords = description.split(" ");
        let descLine = "";
        const descLines: string[] = [];
        const descLineHeight = 40;

        for (let n = 0; n < descWords.length; n++) {
          const testLine = descLine + descWords[n] + " ";
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxTitleWidth && n > 0) {
            descLines.push(descLine.trim());
            descLine = descWords[n] + " ";
          } else {
            descLine = testLine;
          }
        }
        descLines.push(descLine.trim());

        const maxDescLines = aspectRatio === "4:5" ? 4 : 2;
        descLines.slice(0, maxDescLines).forEach((l, idx) => {
          if (idx === maxDescLines - 1 && descLines.length > maxDescLines) {
            ctx.fillText(l + "...", margin, currentY);
          } else {
            ctx.fillText(l, margin, currentY);
          }
          currentY += descLineHeight;
        });
      }

      // Footer Watermark / Branding
      const footerY = height - 48;
      ctx.fillStyle = subTextColor;
      ctx.font = "500 22px sans-serif";
      ctx.fillText("Feed4Grams Card Studio", margin, footerY);

      ctx.fillStyle = accentColor;
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("SWIPE FOR MORE ▶", width - margin, footerY);
      ctx.textAlign = "left";

      resolve();
    };

    if (imageUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => renderCard(img);
      img.onerror = () => renderCard();
      img.src = imageUrl;
    } else {
      renderCard();
    }
  });
}
