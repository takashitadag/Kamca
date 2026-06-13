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
  }

  return String(value).trim();
}

function key(value){
  if(!value || typeof value !== "object") return "";
  return clean(value.klic || value.key || value.id || value.value || value["@_klic"]);
}

function normalize(value){
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function codebook(value){
  return clean(value);
}

function boolText(value){
  const v = normalize(value);
  if(v === "ano" || v === "1") return "Ano";
  if(v === "ne" || v === "0") return "Ne";
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

function formatArea(value){
  const v = clean(value);
  if(!v) return "—";

  const n = Number(v.replace(",", "."));
  if(Number.isNaN(n)) return v;

  return `${n.toLocaleString("cs-CZ")} m²`;
}

function formatUnit(unit){
  const v = normalize(unit);

  if(v === "nemovitost") return "nemovitost";
  if(v === "mesic") return "měsíc";
  if(v === "rok") return "rok";
  if(v === "m2") return "m²";
  if(v === "m2/mesic") return "m² / měsíc";
  if(v === "m2/rok") return "m² / rok";

  return clean(unit);
}

function formatPrice(cena){
  if(!cena) return "Cena u makléře";

  const note = clean(cena.poznamka);
  const amount = clean(cena.castka);
  const unit = formatUnit(cena.jednotka);

  if(!amount && note) return note;
  if(!amount) return "Cena u makléře";

  const n = Number(amount.replace(",", "."));
  const price = Number.isNaN(n)
    ? amount
    : n.toLocaleString("cs-CZ", { maximumFractionDigits: 0 });

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
      order: Number(clean(photo?.poradi)) || index + 1
    }))
    .filter(photo => photo.url)
    .sort((a,b) => a.order - b.order)
    .map(photo => photo.url);
}

function getMainPhoto(item){
  const photos = toArray(item?.fotky?.fotka);

  const main = photos.find(photo => {
    return normalize(photo?.hlavni) === "ano" || clean(photo?.hlavni) === "1";
  });

  if(main){
    return getPhotoUrl(main);
  }

  return getPhotos(item)[0] || FALLBACK_IMAGE;
}

function getReference(item){
  const refs = toArray(item?.reference);
  return refs[0] || null;
}

function getReferenceType(item){
  const ref = getReference(item);
  if(!ref) return "";

  const type = normalize(clean(ref.typ) || key(ref.typ));

  if(type.includes("pronajate") || type.includes("pronajat")) return "Pronajato";
  if(type.includes("prodane") || type.includes("prodan")) return "Prodáno";

  return "";
}

function hasSoldReference(item){
  return Boolean(getReferenceType(item));
}

function getStatus(item){
  const stavKey = key(item.stav) || clean(item.stav);
  const stavText = normalize(item.stav);
  const reserved = normalize(item.rezervovano);

  if(
    stavKey === "40" ||
    stavKey === "50" ||
    stavText.includes("prodan") ||
    stavText.includes("archiv") ||
    hasSoldReference(item)
  ){
    return "sold";
  }

  if(
    stavKey === "30" ||
    stavText.includes("rezerv") ||
    reserved === "ano" ||
    reserved === "1" ||
    reserved === "true"
  ){
    return "reserved";
  }

  if(stavKey === "20" || stavText.includes("aktiv")) return "active";

  return "active";
}

function getTitle(item){
  const ref = getReference(item);

  if(hasSoldReference(item) && clean(ref?.nadpis)){
    return clean(ref.nadpis);
  }

  return clean(item.nadpis_nemovitosti || item.nadpis || "Nemovitost v nabídce");
}

function getDescription(item){
  const ref = getReference(item);

  if(hasSoldReference(item) && clean(ref?.popis)){
    return clean(ref.popis);
  }

  return clean(item.popis_nemovitosti || item.popis || "Detailní informace budou doplněny.");
}

function getReferencePrice(item){
  const ref = getReference(item);
  const type = getReferenceType(item);

  const price = clean(ref?.cena);

  if(price){
    const n = Number(price);
    if(!Number.isNaN(n) && n > 0){
      return n.toLocaleString("cs-CZ") + " Kč";
    }
  }

  return type || "Realizováno";
}

function getParameters(item){
  const a = item.adresa || {};
  const c = item.cena || {};

  return {
    locality: {
      okres: clean(a.okres_nazev),
      obec: clean(a.obec_nazev),
      castObce: clean(a.cobce_nazev || a.mcast_nazev),
      ulice: clean(a.ulice_nazev),
      psc: clean(a.psc),
      katastr: clean(a.ku_nazev),
      gpsLat: clean(a.gps_lat),
      gpsLng: clean(a.gps_lng)
    },
    offer: {
      typSmlouvy: codebook(item.typ_nabidky),
      cisloZakazky: clean(item.cislo_nabidky || item.id_nabidka),
      datumAktualizace: formatDate(item.updated),
      kDispoziciOd: formatDate(item.ready_date),
      druhObjektu: codebook(item.building_type),
      stavObjektu: codebook(item.building_condition),
      zastavenaPlocha: formatArea(item.building_area),
      uzitnaPlocha: formatArea(item.usable_area),
      podlahovaPlocha: formatArea(item.floor_area),
      plochaPozemku: formatArea(item.plot_area),
      celkovaPlocha: formatArea(item.total_area),
      pocetParkovist: clean(item.parking || item.parking_count),
      pocetGarazi: clean(item.garage_count),
      zastavba: codebook(item.surroundings_type),
      rokKolaudace: clean(item.acceptance_year),
      datumNastehovani: formatDate(item.ready_date),
      podlazi: clean(item.floor_number),
      pocetPodlazi: clean(item.floors),
      vybaveno: codebook(item.furnished),
      naklady: clean(item.cost_of_living)
    },
    energy: {
      trida: codebook(item.energy_efficiency_rating),
      vyhlaska: codebook(item.energy_performance_certificate),
      ukazatel: clean(item.energy_performance_summary)
    },
    property: {
      kategorie: codebook(item.typ_nemovitosti),
      dispozice: codebook(item.flat_kind || item.advert_room_count),
      vlastnictvi: codebook(item.ownership),
      stav: codebook(item.flat_class || item.building_condition),
      odpad: codebook(item.gully),
      plyn: codebook(item.gas),
      voda: codebook(item.water),
      elektrina: codebook(item.electricity),
      topeni: codebook(item.heating),
      doprava: codebook(item.transport),
      komunikace: codebook(item.road_type),
      provize: clean(c.provize),
      pravniServis: clean(c.pravni_servis),
      dph: clean(c.dph),
      poplatky: clean(c.poplatky),
      jednatelna: boolText(c.jednatelna)
    }
  };
}

function mapXmlProperty(item){
  const a = item.adresa || {};
  const c = item.cena || {};
  const status = getStatus(item);
  const gallery = getPhotos(item);
  const referenceType = getReferenceType(item);

  return {
    id: clean(item.id_nabidka || item.cislo_nabidky),
    status,

    externalUrl: clean(item.url),

    title: getTitle(item),
    description: getDescription(item),
    longDescription: getDescription(item),

    price: status === "sold" ? getReferencePrice(item) : formatPrice(c),

    city: clean(a.obec_nazev),
    street: clean(a.ulice_nazev),
    district: clean(a.okres_nazev),
    region: clean(a.kraj_nazev),

    estateType: codebook(item.typ_nemovitosti),
    type: status === "sold" ? referenceType || "Realizováno" : codebook(item.typ_nabidky),

    usableArea: formatArea(item.usable_area || item.floor_area || item.total_area),
    plotArea: formatArea(item.plot_area),
    floor: clean(item.floor_number) || "—",
    condition: codebook(item.building_condition) || "—",
    energyClass: codebook(item.energy_efficiency_rating) || "—",

    updated: clean(item.updated),
    created: clean(item.created),
    readyDate: formatDate(item.ready_date),

    statusText: codebook(item.stav) || status,
    statusKey: key(item.stav) || clean(item.stav),
    reserved: status === "reserved",
    referenceType,

    parameters: getParameters(item),

    gpsLat: clean(a.gps_lat),
    gpsLng: clean(a.gps_lng),

    matterportUrl: clean(item.matterport_url),
    videoYoutube: clean(item.video_youtube),

    image: getMainPhoto(item),
    gallery: gallery.length ? gallery : [FALLBACK_IMAGE],

    source: "poski"
  };
}

function sortProperties(items){
  return items.sort((a,b) => {
    const da = Date.parse(a.updated || a.created || "") || 0;
    const db = Date.parse(b.updated || b.created || "") || 0;
    return db - da;
  });
}

function filterByStatus(items, status){
  if(!status || status === "all") return items;

  if(status === "active"){
    return items.filter(item => item.status !== "sold");
  }

  if(status === "reserved"){
    return items.filter(item => item.status === "reserved");
  }

  if(status === "sold"){
    return items.filter(item => item.status === "sold");
  }

  if(status === "prodano"){
    return items.filter(item =>
      item.status === "sold" &&
      normalize(item.type).includes("prodano")
    );
  }

  if(status === "pronajato"){
    return items.filter(item =>
      item.status === "sold" &&
      normalize(item.type).includes("pronajato")
    );
  }

  return items;
}

export default async function handler(req, res){
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const FEED_URL = process.env.POSKI_XML_URL;
  const { id, status } = req.query;

  try{
    if(!FEED_URL){
      return res.status(500).json({
        error: true,
        message: "Chybí POSKI_XML_URL ve Vercelu."
      });
    }

    const response = await fetch(FEED_URL, {
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

    let properties = toArray(data?.export?.nabidky?.nabidka)
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

  }catch(error){
    return res.status(500).json({
      error: true,
      message: "XML feed se nepodařilo načíst.",
      detail: error.message
    });
  }
}
