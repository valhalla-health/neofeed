const fs = require("fs");
const path = require("path");
const { instance } = require("@viz-js/viz");
const sharp = require("sharp");

const renderedDir = path.join(__dirname, "rendered");
const diagrams = [
  { name: "neofeed-system-architecture", pngWidth: 3200 },
  { name: "neofeed-sheet-erd", pngWidth: 2600 },
  { name: "neofeed-daily-log-workflow", pngWidth: 1800 },
];

async function main() {
  const viz = await instance();
  fs.mkdirSync(renderedDir, { recursive: true });

  for (const { name, pngWidth } of diagrams) {
    const dotPath = path.join(renderedDir, `${name}.dot`);
    const svgPath = path.join(renderedDir, `${name}.svg`);
    const pngPath = path.join(renderedDir, `${name}.png`);
    const dot = fs.readFileSync(dotPath, "utf8");
    const svg = viz.renderString(dot, { format: "svg", engine: "dot" });

    fs.writeFileSync(svgPath, svg, "utf8");
    const info = await sharp(Buffer.from(svg), { density: 180 })
      .resize({ width: pngWidth, withoutEnlargement: true })
      .png()
      .toFile(pngPath);

    process.stdout.write(
      `${name}: ${info.width}x${info.height} (${info.size} bytes)\n`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
