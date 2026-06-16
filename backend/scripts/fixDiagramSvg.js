require('dotenv').config();

const pool = require('../config/database');

const fixSvg = (svg) => {
  if (!svg) return svg;

  let output = svg;
  const svgOpenTag = output.match(/<svg\b[^>]*>/i)?.[0] || '';

  if (!/\swidth=/.test(svgOpenTag)) {
    output = output.replace('<svg', '<svg width="640"');
  }

  const svgOpenTagWithWidth = output.match(/<svg\b[^>]*>/i)?.[0] || '';

  if (!/\sheight=/.test(svgOpenTagWithWidth)) {
    output = output.replace('<svg', '<svg height="320"');
  }

  return output;
};

const run = async () => {
  const result = await pool.query('SELECT id, diagram_svg FROM question WHERE diagram_svg IS NOT NULL');
  let updated = 0;

  for (const row of result.rows) {
    const nextSvg = fixSvg(row.diagram_svg);

    if (nextSvg !== row.diagram_svg) {
      await pool.query('UPDATE question SET diagram_svg = $1 WHERE id = $2', [nextSvg, row.id]);
      updated += 1;
    }
  }

  console.log(`Updated ${updated} diagram SVG rows`);
  await pool.end();
};

run().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => {});
  process.exit(1);
});
