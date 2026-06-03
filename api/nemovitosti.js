import { XMLParser } from "fast-xml-parser";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?q=80&w=1200&auto=format&fit=crop";

function toArray(value){
  if(!value) return [];
  return Array.isArray(value) ? value : [value];
}

function clean(value){
  if(value === undefined || value === null) return "";

  if(typeof value === "object"){
    if(value["#text"] !== undefined) return String(value["#text"]).trim();
    if(value.text !== undefined) return String(value.text).trim();
    if(value._text !== undefined) return String(value._text).trim();
    if(value.klic !== undefined) return String(value.klic).trim();
    if(value.key !== undefined) return String(value.key).trim();
  }

  return String(value).trim();
}

function key(value){
  if(value === undefined || value === null) return "";
  if(typeof value === "object"){
    return clean(value.klic || value.key || value.id || value.value || value["@_klic"]);
  }
  return "";
}

function normalize(value){
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getCodebookValue(value){
  if(value === undefined || value === null) return "";

  if(typeof value === "object"){
    if(value["#text"] !== undefined) return clean(value["#text"]);
    if(value.text !== undefined) return clean(value.text);
    if(value._text !== undefined) return clean(value._text);
  }

  return clean(value);
}

function buildFeedUrl(url){
  const finalUrl = new URL(url);

  if(!finalUrl.searchParams.has("limit")){
    finalUrl.searchParams.set("limit", "999");
  }

  if(!finalUrl.searchParams.has("offset")){
    finalUrl.searchParams.set("offset", "0");
  }

  if(!finalUrl.searchParams.has("orderby")){
    finalUrl.searchParams.set("orderby", "new");
  }

  if(!finalUrl.searchParams.has("sort")){
    finalUrl.searchParams.set("sort", "DESC");
  }

  return finalUrl.toString();
}

function getPhotos(item){
  const photos = toArray(item?.fotky?.fotka);

  return photos
    .map(photo => {
      if(typeof photo === "string") return clean(photo);
      return clean(photo?.url || photo?.URL || photo?.href || photo);
    })
    .filter(Boolean);
}

function getMainPhoto(item){
  const photos = toArray(item?.fotky?.fotka);

  const main = photos.find(photo => {
    return normalize(photo?.hlavni) === "ano" || clean(photo?.hlavni) === "1";
  });

  if(main){
    return clean(main.url || main.URL || main.href || main);
  }

  const allPhotos = getPhotos(item);
  return allPhotos[0] || "";
}

function formatUnit(unit){
  const value = getCodebookValue(unit);
  if(!value) return "";

  const normalized = normalize(value);

  if(normalized === "nemovitost") return "nemovitost";
  if(normalized === "mesic") return "měsíc";
  if(normalized === "rok") return "rok";
  if(normalized === "m2") return "m²";
  if(normalized === "m2/mesic") return "m² / měsíc";
  if(normalized === "m2/rok") return "m² / rok";

  return value;
}

function formatPrice(cena){
  if(!cena) return "Cena u makléře";

  const note = clean(cena.poznamka);
  const amount = clean(cena.castka);
  const unit = formatUnit(cena.jednotka);

  if(!amount && note) return note;
  if(!amount) return "Cena u makléře";

  const number = Number(String(amount).replace(",", "."));
  const formatted = Number.isNaN(number)
    ? amount
    : number.toLocaleString("cs-CZ", { maximumFractionDigits: 0 });

  return unit ? `${formatted} Kč / ${unit}` : `${formatted} Kč`;
}

function formatArea(value){
  const cleaned = clean(value);
  if(!cleaned) return "—";

  const number = Number(String(cleaned).replace(",", "."));
  if(Number.isNaN(number)) return cleaned;

  return `${number.toLocaleString("cs-CZ")} m²`;
}

function formatDate(value){
  const v = clean(value);
  if(!v) return "";

  const date = v.split(" ")[0];
  const parts = date.split("-");

  if(parts.length !== 3) return v;

  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function boolText(value){
  const normalized = normalize(value);

  if(!normalized) return "";
  if(normalized === "ano" || normalized === "1") return "Ano";
  if(normalized === "ne" || normalized === "0") return "Ne";

  return clean(value);
}

function getReference(item){
  const references = toArray(item?.reference);
  return references[0] || null;
}

function hasMeaningfulReference(item){
  const reference = getReference(item);
  if(!reference) return false;

  const values = [
    clean(reference.typ),
    clean(reference.type),
    key(reference.typ),
    key(reference.type),
    clean(reference.nadpis),
    clean(reference.popis),
    clean(reference.cena),
    clean(reference.datum_vlozeni),
    clean(reference.detail),
    clean(reference.video),
    clean(reference.matterport)
  ].filter(Boolean);

  return values.length > 0;
}

function getReferenceType(item){
  if(!hasMeaningfulReference(item)) return "";

  const reference = getReference(item) || {};
  const rawType = clean(reference.typ || reference.type);
  const rawKey = key(reference.typ || reference.type);
  const type = normalize(rawType || rawKey);

  if(type.includes("pronajat") || type.includes("pronajate")){
    return "Pronajato";
  }

  if(type.includes("prodan") || type.includes("prodane")){
    return "Prodáno";
  }

  return "Realizováno";
}

function getStatus(item){
  const stavText = normalize(getCodebookValue(item.stav));
  const stavKey = key(item.stav) || clean(item.stav);
  const reserved = normalize(item.rezervovano);

  if(hasMeaningfulReference(item)){
    return "sold";
  }

  if(
    stavKey === "40" ||
    stavKey === "50" ||
    stavText.includes("prodan") ||
    stavText.includes("pronajat") ||
    stavText.includes("archiv")
  ){
    return "sold";
  }

  if(
    stavKey === "30" ||
    stavText.includes("rezerv") ||
    reserved === "ano" ||
    reserved === "1"
  ){
    return "reserved";
  }

  if(stavKey === "20" || stavText.includes("aktiv")){
    return "active";
  }

  return "active";
}

function getTitle(item){
  const reference = getReference(item) || {};
  const referenceTitle = clean(reference.nadpis);

  return (
    referenceTitle ||
    clean(item.nadpis_nemovitosti) ||
    clean(item.nadpis) ||
    "Nemovitost v nabídce"
  );
}

function getDescription(item){
  const reference = getReference(item) || {};
  const referenceDescription = clean(reference.popis);

  return (
    referenceDescription ||
    clean(item.popis_nemovitosti) ||
    clean(item.popis) ||
    "Detailní informace budou doplněny."
  );
}

function getReferencePrice(item){
  const reference = getReference(item) || {};
  const referenceType = getReferenceType(item) || "Realizováno";
  const referencePrice = clean(reference.cena);

  if(referencePrice){
    const number = Number(String(referencePrice).replace(",", "."));

    if(!Number.isNaN(number) && number > 0){
      return number.toLocaleString("cs-CZ") + " Kč";
    }
  }

  return referenceType;
}

function getParameters(item){
  const adresa = item.adresa || {};
  const cena = item.cena || {};

  return {
    locality: {
      okres: clean(adresa.okres_nazev),
      obec: clean(adresa.obec_nazev),
      castObce: clean(adresa.cobce_nazev || adresa.mcast_nazev),
      ulice: clean(adresa.ulice_nazev),
      psc: clean(adresa.psc),
      katastr: clean(adresa.ku_nazev),
      gpsLat: clean(adresa.gps_lat),
      gpsLng: clean(adresa.gps_lng)
    },

    offer: {
      typSmlouvy: getCodebookValue(item.typ_nabidky),
      cisloZakazky: clean(item.cislo_nabidky || item.id_nabidka),
      datumAktualizace: formatDate(item.updated),
      kDispoziciOd: formatDate(item.ready_date),
      druhObjektu: getCodebookValue(item.building_type),
      stavObjektu: getCodebookValue(item.building_condition),
      zastavenaPlocha: formatArea(item.building_area),
      uzitnaPlocha: formatArea(item.usable_area),
      podlahovaPlocha: formatArea(item.floor_area),
      plochaPozemku: formatArea(item.plot_area),
      celkovaPlocha: formatArea(item.total_area),
      pocetParkovist: clean(item.parking || item.parking_count),
      pocetGarazi: clean(item.garage_count),
      zastavba: getCodebookValue(item.surroundings_type),
      rokKolaudace: clean(item.acceptance_year),
      datumNastehovani: formatDate(item.ready_date),
      podlazi: clean(item.floor_number),
      pocetPodlazi: clean(item.floors),
      vybaveno: getCodebookValue(item.furnished),
      naklady: clean(item.cost_of_living)
    },

    energy: {
      trida: getCodebookValue(item.energy_efficiency_rating),
      vyhlaska: getCodebookValue(item.energy_performance_certificate),
      ukazatel: clean(item.energy_performance_summary)
    },

    property: {
      kategorie: getCodebookValue(item.typ_nemovitosti),
      dispozice: getCodebookValue(item.flat_kind || item.advert_room_count),
      vlastnictvi: getCodebookValue(item.ownership),
      stavBytu: getCodebookValue(item.flat_class || item.building_condition),
      odpad: getCodebookValue(item.gully),
      plyn: getCodebookValue(item.gas),
      voda: getCodebookValue(item.water),
      elektrina: getCodebookValue(item.electricity),
      topeni: getCodebookValue(item.heating),
      doprava: getCodebookValue(item.transport),
      komunikace: getCodebookValue(item.road_type),
      provize: clean(cena.provize),
      pravniServis: clean(cena.pravni_servis),
      dph: clean(cena.dph),
      poplatky: clean(cena.poplatky),
      jednatelna: boolText(cena.jednatelna)
    }
  };
}

function mapXmlProperty(item){
  const adresa = item.adresa || {};
  const cena = item.cena || {};
  const status = getStatus(item);
  const referenceType = getReferenceType(item);

  const city = clean(adresa.obec_nazev);
  const street = clean(adresa.ulice_nazev);

  return {
    id: clean(item.id_nabidka || item.cislo_nabidky),
    status,
    externalUrl: clean(item.url),

    title: getTitle(item),
    description: getDescription(item),
    longDescription: getDescription(item),

    price: status === "sold" ? getReferencePrice(item) : formatPrice(cena),

    city,
    street,
    district: clean(adresa.okres_nazev),
    region: clean(adresa.kraj_nazev),

    estateType: getCodebookValue(item.typ_nemovitosti),
    type: status === "sold"
      ? referenceType || "Realizováno"
      : getCodebookValue(item.typ_nabidky),

    usableArea: formatArea(item.usable_area || item.floor_area || item.total_area),
    plotArea: formatArea(item.plot_area),
    floor: clean(item.floor_number) || "—",
    condition: getCodebookValue(item.building_condition) || "—",
    energyClass: getCodebookValue(item.energy_efficiency_rating) || "—",

    updated: clean(item.updated),
    created: clean(item.created),
    readyDate: formatDate(item.ready_date),
    statusText: getCodebookValue(item.stav) || status,
    referenceType,

    parameters: getParameters(item),

    gpsLat: clean(adresa.gps_lat),
    gpsLng: clean(adresa.gps_lng),
    matterportUrl: clean(item.matterport_url),
    videoYoutube: clean(item.video_youtube),

    image: getMainPhoto(item) || FALLBACK_IMAGE,
    gallery: getPhotos(item).length ? getPhotos(item) : [FALLBACK_IMAGE],

    source: "poski"
  };
}

const fallbackData = [
  {
    id: "test-1",
    status: "active",
    title: "Testovací nabídka",
    description: "Toto je pouze testovací nabídka. Po vložení XML feedu se zde zobrazí reálné nemovitosti z Poski.",
    longDescription: "Tato položka slouží pouze pro otestování webu.",
    price: "Cena u makléře",
    city: "Olomouc",
    street: "",
    district: "Olomouc",
    region: "Olomoucký kraj",
    estateType: "Byt",
    type: "Pronájem",
    usableArea: "—",
    plotArea: "—",
    floor: "—",
    condition: "—",
    energyClass: "—",
    image: FALLBACK_IMAGE,
    gallery: [FALLBACK_IMAGE],
    source: "fallback"
  }
];

function sortProperties(properties){
  return properties.sort((a,b) => {
    const dateA = Date.parse(a.updated || a.created || "") || 0;
    const dateB = Date.parse(b.updated || b.created || "") || 0;
    return dateB - dateA;
  });
}

function filterByStatus(properties, status){
  if(!status || status === "all") return properties;

  if(status === "active"){
    return properties.filter(item => item.status === "active" || item.status === "reserved");
  }

  if(status === "sold"){
    return properties.filter(item => item.status === "sold");
  }

  if(status === "reserved"){
    return properties.filter(item => item.status === "reserved");
  }

  if(status === "rented"){
    return properties.filter(item => normalize(item.type).includes("pronajato"));
  }

  if(status === "soldOnly"){
    return properties.filter(item => normalize(item.type).includes("prodano"));
  }

  return properties.filter(item => item.status === status);
}

function getItemsFromParsedXml(data){
  return toArray(data?.export?.nabidky?.nabidka);
}

export default async function handler(req, res){
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const FEED_URL = process.env.POSKI_XML_URL;
  const { id, status } = req.query;

  try{
    if(FEED_URL && !FEED_URL.includes("example.com")){
      const response = await fetch(buildFeedUrl(FEED_URL), {
        headers: {
          "User-Agent": "KamilaKoprivovaWebsite/1.0"
        }
      });

      if(!response.ok){
        throw new Error(`Feed vrátil status ${response.status}`);
      }

      const xml = await response.text();

      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "",
        trimValues: true,
        parseAttributeValue: false,
        parseTagValue: false
      });

      const data = parser.parse(xml);
      const errors = toArray(data?.export?.chyba);

      if(errors.length){
        return res.status(500).json({
          error: true,
          source: "poski",
          message: "Poski export vrátil chybu.",
          details: errors.map(clean)
        });
      }

      let properties = getItemsFromParsedXml(data)
        .map(mapXmlProperty)
        .filter(item => item.id && item.title);

      properties = sortProperties(properties);

      if(id){
        const detail = properties.find(item => String(item.id) === String(id));

        if(!detail){
          return res.status(404).json({
            error: true,
            message: "Nemovitost nebyla nalezena."
          });
        }

        return res.status(200).json(detail);
      }

      return res.status(200).json(filterByStatus(properties, status));
    }

    let properties = sortProperties([...fallbackData]);

    if(id){
      const detail = properties.find(item => String(item.id) === String(id));

      if(!detail){
        return res.status(404).json({
          error: true,
          message: "Nemovitost nebyla nalezena."
        });
      }

      return res.status(200).json(detail);
    }

    return res.status(200).json(filterByStatus(properties, status));

  }catch(error){
    return res.status(200).json({
      error: true,
      source: "fallback",
      message: "XML feed zatím není dostupný.",
      detail: error.message,
      items: filterByStatus(sortProperties([...fallbackData]), status)
    });
  }
}
