import fs from "fs";
import simplify from "@turf/simplify";

const geoPath = "public/geo/floripa-bairros.geojson";
const migrationPath =
  "supabase/migrations/20260806140000_corrigir_geoms_bairros_osm.sql";

const raw = JSON.parse(fs.readFileSync(geoPath, "utf8"));

/** Mantém só props estáveis no GeoJSON público. */
const cleaned = {
  type: "FeatureCollection",
  features: raw.features.map((f) => ({
    type: "Feature",
    properties: {
      nome: f.properties.nome,
      regiao: f.properties.regiao,
      distrito: f.properties.distrito,
      fonte_geometria: f.properties.fonte_geometria,
    },
    geometry: f.geometry,
  })),
};

const simplified = {
  ...cleaned,
  features: cleaned.features.map((f) => {
    try {
      return simplify(f, {
        tolerance: 0.00015,
        highQuality: true,
        mutate: false,
      });
    } catch {
      return f;
    }
  }),
};

fs.writeFileSync(geoPath, JSON.stringify(simplified));
console.log("geojson size", fs.statSync(geoPath).size);

function esc(s) {
  return String(s).replace(/'/g, "''");
}

function slugify(n) {
  return n
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const values = simplified.features.map((f) => {
  const p = f.properties;
  const geom = JSON.stringify(f.geometry);
  return `  ('${slugify(p.nome)}', '${esc(p.nome)}', '${esc(p.regiao)}', '${esc(p.distrito)}', ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON('${esc(geom)}'), 4326)))`;
});

const lines = [
  "-- Corrige geometrias OSM dos bairros (admin_level=10 / evita lago e distrito).",
  "-- Atualiza polígonos sem apagar taxas, faixas nem descontos já configurados.",
  "-- Fonte: Nominatim relations alinhadas aos 56 bairros do Decreto 29.142/2026.",
  "",
  "set search_path = public, extensions;",
  "",
  "insert into public.delivery_bairros_frete (slug, nome, regiao, distrito, geom)",
  "values",
  values.join(",\n"),
  "on conflict (slug) do update set",
  "  nome = excluded.nome,",
  "  regiao = excluded.regiao,",
  "  distrito = excluded.distrito,",
  "  geom = excluded.geom,",
  "  atualizado_em = now();",
  "",
];

fs.writeFileSync(migrationPath, lines.join("\n"));
console.log("migration", migrationPath, fs.statSync(migrationPath).size, "bairros", values.length);
