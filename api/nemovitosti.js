import { XMLParser } from "fast-xml-parser";

const FALLBACK_IMAGE =
  "images/IMG_1007.png";

const TYPE_KEYS = {
  "1":"domy", "2":"chaty", "3":"byty", "4":"pozemky", "5":"komercni-objekty",
  "6":"garaze", "8":"najemni-domy", "9":"historicke", "10":"hotely", "11":"komercni-prostory", "12":"zemedelske"
};

const OFFER_KEYS = { "1":"prodej", "3":"pronajem", "5":"vymena", "6":"drazba", "8":"aukce", "10":"soutez" };
const STATUS_KEYS = { "10":"concept", "20":"active", "30":"reserved", "40":"sold", "50":"archive" };

function toArray(value){
  if(value === undefined || value === null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

function clean(value){
  if(value === undefined || value === null) return "";

  if(typeof value === "object"){
    if(value["#text"] !== undefined) return String(value["#text"]).trim();
    if(value.text !== undefined) return String(value.text).trim();
    if(value._text !== undefined) return String(value._text).trim();
    if(value["#cdata"] !== undefined) return String(value["#cdata"]).trim();

    // Některé Poski číselníky mohou přijít jen jako atribut klic bez textové hodnoty.
    // Nevracíme "[object Object]", protože to rozbíjí statusy, reference i filtry.
    if(value.klic !== undefined) return String(value.klic).trim();
    if(value["@_klic"] !== undefined) return String(value["@_klic"]).trim();
    if(value.key !== undefined) return String(value.key).trim();
    if(value.value !== undefined) return String(value.value).trim();

    return "";
  }

  return String(value).trim();
}

function attr(value, name){
  if(!value || typeof value !== "object") return "";
  return clean(value[name] ?? value[`@_${name}`]);
}

function key(value){
  if(value === undefined || value === null) return "";
  if(typeof value === "object") return clean(value.klic ?? value.key ?? value.id ?? value.value ?? value["@_klic"]);
  return clean(value);
}

function normalize(value){
  return clean(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function codebook(value){
  if(value === undefined || value === null) return "";

  if(typeof value === "object"){
    return clean(value["#text"] ?? value.text ?? value._text ?? value["#cdata"] ?? value.klic ?? value["@_klic"] ?? value.key ?? value.value);
  }

  return clean(value);
}

function boolText(value){
  const v = normalize(value);
  if(["ano","1","true"].includes(v)) return "Ano";
  if(["ne","0","false"].includes(v)) return "Ne";
  return clean(value);
}

function formatDate(value){
  const v = clean(value);
  if(!v) return "";
  const d = v.split(" ")[0];
  const parts = d.split("-");
  if(parts.length !== 3) return v;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function numberValue(value){
  const v = clean(value).replace(/\s/g, "").replace(",", ".");
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function formatArea(value){
  const n = numberValue(value);
  if(n === null) return clean(value) || "—";
  return `${n.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} m²`;
}

function formatUnit(unit){
  const raw = clean(unit);
  const v = normalize(raw);
  if(v === "nemovitost") return "nemovitost";
  if(v === "mesic") return "měsíc";
  if(v === "rok") return "rok";
  if(v === "m2") return "m²";
  if(v === "m2/mesic") return "m² / měsíc";
  if(v === "m2/rok") return "m² / rok";
  return raw;
}

function formatPrice(cena){
  if(!cena) return "Cena u makléře";
  const note = clean(cena.poznamka);
  const amount = clean(cena.castka);
  const unit = formatUnit(cena.jednotka);
  if(!amount && note) return note;
  if(!amount) return "Cena u makléře";
  const n = numberValue(amount);
  const price = n === null ? amount : n.toLocaleString("cs-CZ", { maximumFractionDigits: 0 });
  return `${price} Kč${unit ? " / " + unit : ""}`;
}

function getPhotoUrl(photo){
  if(typeof photo === "string") return clean(photo);
  return clean(photo?.url || photo?.URL || photo?.href || photo?.url?.["#text"] || photo?.fotka);
}

function getPhotos(item){
  return toArray(item?.fotky?.fotka)
    .map((photo, index) => ({
      url: getPhotoUrl(photo),
      main: ["ano","1","true"].includes(normalize(photo?.hlavni)),
      order: numberValue(photo?.poradi) ?? index + 1
    }))
    .filter(photo => photo.url)
    .sort((a,b) => (b.main - a.main) || (a.order - b.order))
    .map(photo => photo.url);
}

function getMainPhoto(item){
  return getPhotos(item)[0] || FALLBACK_IMAGE;
}

function getReference(item){
  return toArray(item?.reference)[0] || null;
}

function getReferenceType(item){
  const ref = getReference(item);
  if(!ref) return "";

  const rawType = clean(ref.typ || ref.type) || key(ref.typ || ref.type);
  const t = normalize(rawType);

  if(t.includes("pronajate") || t.includes("pronajat")) return "Pronajato";
  if(t.includes("prodane") || t.includes("prodan")) return "Prodáno";

  return "";
}

function hasSoldReference(item){
  const ref = getReference(item);
  if(!ref) return false;

  if(getReferenceType(item)) return true;

  // Reference bez typu bereme jen tehdy, když skutečně obsahuje portfolio data.
  return Boolean(
    clean(ref.nadpis) ||
    clean(ref.popis) ||
    clean(ref.cena) ||
    clean(ref.datum_vlozeni)
  );
}

function getStatus(item){
  const stavKey = key(item.stav);
  const stavText = normalize(item.stav);
  const reserved = normalize(item.rezervovano);

  if(hasSoldReference(item)) return "sold";
  if(stavKey === "40" || stavKey === "50" || stavText.includes("prod") || stavText.includes("archiv")) return "sold";
  if(stavKey === "30" || stavText.includes("rezerv") || ["ano","1","true"].includes(reserved)) return "reserved";
  if(stavKey === "20" || stavText.includes("aktiv")) return "active";
  if(stavKey === "10") return "concept";
  return "active";
}

function getTypeSlug(item){
  const k = key(item.typ_nemovitosti);
  if(TYPE_KEYS[k]) return TYPE_KEYS[k];
  const t = normalize(item.typ_nemovitosti);
  if(t.includes("byt")) return "byty";
  if(t.includes("chata") || t.includes("rekreac")) return "chaty";
  if(t.includes("dum") || t.includes("vila")) return "domy";
  if(t.includes("pozem")) return "pozemky";
  if(t.includes("garaz") || t.includes("male objekt")) return "garaze";
  if(t.includes("hotel") || t.includes("penzion")) return "hotely";
  if(t.includes("zemedel")) return "zemedelske";
  if(t.includes("najemni")) return "najemni-domy";
  if(t.includes("histor")) return "historicke";
  if(t.includes("komercni prostor")) return "komercni-prostory";
  if(t.includes("komerc")) return "komercni-objekty";
  return "ostatni";
}

function getOfferSlug(item){
  const k = key(item.typ_nabidky);
  if(OFFER_KEYS[k]) return OFFER_KEYS[k];
  const t = normalize(item.typ_nabidky);
  if(t.includes("prodej")) return "prodej";
  if(t.includes("pronajem")) return "pronajem";
  if(t.includes("vymena")) return "vymena";
  if(t.includes("drazba")) return "drazba";
  if(t.includes("aukce")) return "aukce";
  if(t.includes("soutez")) return "soutez";
  return "nabidka";
}

function getTitle(item){
  const ref = getReference(item);
  if(hasSoldReference(item) && clean(ref?.nadpis)) return clean(ref.nadpis);
  return clean(item.nadpis_nemovitosti || item.nadpis || "Nemovitost v nabídce");
}

function getDescription(item){
  const ref = getReference(item);
  if(hasSoldReference(item) && clean(ref?.popis)) return clean(ref.popis);
  return clean(item.popis_nemovitosti || item.popis || "Detailní informace budou doplněny.");
}

function getReferencePrice(item){
  const ref = getReference(item);
  const price = clean(ref?.cena);
  const n = numberValue(price);
  if(n !== null && n > 0) return n.toLocaleString("cs-CZ") + " Kč";
  return getCompletionType(item) || "Realizováno";
}

function getParameters(item){
  const a = item.adresa || {};
  const c = item.cena || {};
  return {
    locality: {
      okres: clean(a.okres_nazev), obec: clean(a.obec_nazev), castObce: clean(a.cobce_nazev || a.mcast_nazev),
      ulice: clean(a.ulice_nazev), psc: clean(a.psc), katastr: clean(a.ku_nazev), gpsLat: clean(a.gps_lat), gpsLng: clean(a.gps_lng)
    },
    offer: {
      typSmlouvy: codebook(item.typ_nabidky), cisloZakazky: clean(item.cislo_nabidky || item.id_nabidka),
      datumAktualizace: formatDate(item.updated), kDispoziciOd: formatDate(item.ready_date),
      druhObjektu: codebook(item.building_type), stavObjektu: codebook(item.building_condition),
      zastavenaPlocha: formatArea(item.building_area), uzitnaPlocha: formatArea(item.usable_area),
      podlahovaPlocha: formatArea(item.floor_area), plochaPozemku: formatArea(item.plot_area), celkovaPlocha: formatArea(item.total_area),
      pocetParkovist: clean(item.parking || item.parking_count), pocetGarazi: clean(item.garage_count),
      zastavba: codebook(item.surroundings_type), rokKolaudace: clean(item.acceptance_year), datumNastehovani: formatDate(item.ready_date),
      podlazi: clean(item.floor_number), pocetPodlazi: clean(item.floors), vybaveno: codebook(item.furnished), naklady: clean(item.cost_of_living)
    },
    energy: { trida: codebook(item.energy_efficiency_rating), vyhlaska: codebook(item.energy_performance_certificate), ukazatel: clean(item.energy_performance_summary) },
    property: {
      kategorie: codebook(item.typ_nemovitosti), dispozice: codebook(item.flat_kind || item.advert_room_count), vlastnictvi: codebook(item.ownership),
      stav: codebook(item.flat_class || item.building_condition), odpad: codebook(item.gully), plyn: codebook(item.gas), voda: codebook(item.water),
      elektrina: codebook(item.electricity), topeni: codebook(item.heating), doprava: codebook(item.transport), komunikace: codebook(item.road_type),
      provize: clean(c.provize), pravniServis: clean(c.pravni_servis), dph: clean(c.dph), poplatky: clean(c.poplatky), jednatelna: boolText(c.jednatelna)
    }
  };
}

function getCompletionType(item){
  const referenceType = getReferenceType(item);
  if(referenceType) return referenceType;

  const offerSlug = getOfferSlug(item);
  const offerText = normalize(item.typ_nabidky);

  if(offerSlug === "pronajem" || offerText.includes("pronajem")) return "Pronajato";
  if(offerSlug === "prodej" || offerText.includes("prodej")) return "Prodáno";

  return "Realizováno";
}

function getDisplayType(item, status){
  return status === "sold" ? getCompletionType(item) : codebook(item.typ_nabidky);
}

function getDisplayPrice(item, status){
  return status === "sold" ? getReferencePrice(item) : formatPrice(item.cena);
}

function mapXmlProperty(item, feedIndex = 0){
  const a = item.adresa || {};
  const ref = getReference(item) || {};
  const status = getStatus(item);
  const referenceType = getCompletionType(item);
  const gallery = getPhotos(item);
  const typeSlug = getTypeSlug(item);
  const offerSlug = getOfferSlug(item);
  return {
    id: clean(item.id_nabidka || item.cislo_nabidky), status,
    feedIndex,
    externalUrl: clean(item.url),
    title: getTitle(item), description: getDescription(item), longDescription: getDescription(item),
    price: getDisplayPrice(item, status),
    city: clean(a.obec_nazev), street: clean(a.ulice_nazev), district: clean(a.okres_nazev), region: clean(a.kraj_nazev),
    estateType: codebook(item.typ_nemovitosti), estateTypeKey: key(item.typ_nemovitosti), typeSlug,
    type: getDisplayType(item, status), offerTypeKey: key(item.typ_nabidky), offerSlug,
    usableArea: formatArea(item.usable_area || item.floor_area || item.total_area), plotArea: formatArea(item.plot_area),
    floor: clean(item.floor_number) || "—", condition: codebook(item.building_condition) || "—", energyClass: codebook(item.energy_efficiency_rating) || "—",
    updated: clean(item.updated), created: clean(item.created), referenceDate: clean(ref.datum_vlozeni), readyDate: formatDate(item.ready_date),
    statusText: codebook(item.stav) || STATUS_KEYS[key(item.stav)] || status, statusKey: key(item.stav), reserved: status === "reserved", referenceType,
    parameters: getParameters(item), gpsLat: clean(a.gps_lat), gpsLng: clean(a.gps_lng),
    matterportUrl: clean(item.matterport_url), videoYoutube: clean(item.video_youtube),
    image: getMainPhoto(item), gallery: gallery.length ? gallery : [FALLBACK_IMAGE], source: "poski"
  };
}

function numericId(item){
  return Number(String(item.id || "").replace(/\D/g, "")) || 0;
}

function sortDate(item){
  // Řazení podle data přidání, ne podle aktualizace.
  // Poski umí po úpravě staré nabídky změnit `updated`, což by ji nesprávně vytáhlo nahoru.
  // Realizace řadíme podle data reference; aktivní nabídky podle `created`, případně podle ID jako stabilní náhrady.
  const primary = item.status === "sold"
    ? (item.referenceDate || item.created)
    : item.created;

  return Date.parse(primary || "") || 0;
}

function sortProperties(items){
  return items.sort((a,b) => {
    const dateA = sortDate(a);
    const dateB = sortDate(b);

    if(dateA || dateB){
      const byDate = dateB - dateA;
      if(byDate !== 0) return byDate;
    }

    const feedFallback = (a.feedIndex ?? 0) - (b.feedIndex ?? 0);
    if(feedFallback !== 0) return feedFallback;

    return numericId(b) - numericId(a);
  });
}

function filterByStatus(items, status){
  const s = normalize(status);
  if(!s || s === "all") return items;
  if(s === "active") return items.filter(i => i.status === "active" || i.status === "reserved");
  if(s === "reserved") return items.filter(i => i.status === "reserved");
  if(s === "sold") return items.filter(i => i.status === "sold");
  if(s === "prodano") return items.filter(i => i.status === "sold" && normalize(i.type).includes("prodano"));
  if(s === "pronajato") return items.filter(i => i.status === "sold" && normalize(i.type).includes("pronajato"));
  return items.filter(i => [i.status, i.typeSlug, i.offerSlug].map(normalize).includes(s));
}

function buildFeedUrl(rawUrl){
  const url = new URL(rawUrl);

  if(!url.searchParams.has("orderby")){
    url.searchParams.set("orderby", "new");
  }

  if(!url.searchParams.has("sort")){
    url.searchParams.set("sort", "DESC");
  }

  return url.toString();
}

export default async function handler(req, res){
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const FEED_URL = process.env.POSKI_XML_URL;
  const { id, status } = req.query;

  try{
    if(!FEED_URL){
      return res.status(500).json({ error: true, message: "Chybí POSKI_XML_URL ve Vercelu." });
    }

    const response = await fetch(buildFeedUrl(FEED_URL), { headers: { "User-Agent": "KamilaKoprivovaWebsite/1.0" } });
    if(!response.ok) throw new Error(`Feed vrátil status ${response.status}`);

    const xml = await response.text();
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", textNodeName: "#text", trimValues: true, parseAttributeValue: false, parseTagValue: false });
    const data = parser.parse(xml);
    const errors = toArray(data?.export?.chyba);
    if(errors.length){
      return res.status(500).json({ error: true, source: "poski", message: "Poski export vrátil chybu.", details: errors.map(clean) });
    }

    let properties = toArray(data?.export?.nabidky?.nabidka).map((item, index) => mapXmlProperty(item, index)).filter(item => item.id && item.title);
    properties = sortProperties(properties);

    if(id){
      const detail = properties.find(item => String(item.id) === String(id));
      if(!detail) return res.status(404).json({ error: true, message: "Nemovitost nebyla nalezena." });
      return res.status(200).json(detail);
    }

    return res.status(200).json(filterByStatus(properties, status));
  }catch(error){
    return res.status(500).json({ error: true, message: "XML feed se nepodařilo načíst.", detail: error.message });
  }
}
