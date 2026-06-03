import { XMLParser } from "fast-xml-parser";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?q=80&w=1200&auto=format&fit=crop";

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
  if(value === undefined || value === null) return "";
  if(typeof value === "object") return clean(value.klic || value.key || value.id || value.value || value["@_klic"]);
  return "";
}

function getCodebookValue(value){
  return clean(value);
}

function normalize(value){
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

  if(main) return clean(main.url || main.URL || main.href || main);

  const allPhotos = getPhotos(item);
  return allPhotos[0] || "";
}

function formatUnit(unit){
  const value = clean(unit);
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

  const suffix = unit ? ` / ${unit}` : "";
  return `${formatted} Kč${suffix}`;
}

function formatArea(value){
  const cleaned = clean(value);
  if(!cleaned) return "—";

  const number = Number(String(cleaned).replace(",", "."));
  if(Number.isNaN(number)) return cleaned;

  return `${number.toLocaleString("cs-CZ")} m²`;
}

function getNested(value, path){
  return path.split(".").reduce((acc, keyName) => {
    if(acc === undefined || acc === null) return undefined;
    return acc[keyName];
  }, value);
}

function hasMeaningfulReference(item){
  const reference = item?.reference;
  if(!reference) return false;

  const values = [
    reference.typ,
    reference.type,
    reference.nadpis,
    reference.popis,
    reference.cena,
    reference.datum_vlozeni
  ].map(clean).filter(Boolean);

  return values.length > 0;
}

function getReferenceType(item){
  const reference = item?.reference || {};
  const type = normalize(reference.typ || reference.type);

  if(type.includes("pronajat")) return "Pronajato";
  if(type.includes("prodan")) return "Prodáno";

  return "Realizováno";
}

function getStatus(item){
  const stavText = normalize(item.stav);
  const stavKey = key(item.stav);
  const referenceType = normalize(item?.reference?.typ || item?.reference?.type);

  // Poski: stav 20 = Aktivní, 30 = Rezervovaná, 40 = Prodaná, 50 = Archivní.
  // Referenční nabídky nejsou aktivní nabídky, i když v exportu mohou přijít vedle běžných nabídek.
  if(
    hasMeaningfulReference(item) ||
    stavKey === "40" ||
    stavKey === "50" ||
    stavText.includes("prodana") ||
    stavText.includes("prodano") ||
    stavText.includes("pronajata") ||
    stavText.includes("pronajato") ||
    stavText.includes("archiv") ||
    referenceType.includes("prodane") ||
    referenceType.includes("pronajate")
  ){
    return "sold";
  }

  if(stavKey === "30" || stavText.includes("rezerv")){
    return "reserved";
  }

  if(stavKey === "20" || stavText.includes("aktiv")){
    return "active";
  }

  // Pokud Poski stav v exportu vůbec nepošle, necháme nabídku jako aktivní, aby se neztratila.
  return "active";
}

function getTitle(item){
  const referenceTitle = clean(item?.reference?.nadpis);
  return referenceTitle || clean(item.nadpis_nemovitosti) || clean(item.nadpis) || "Nemovitost v nabídce";
}

function getDescription(item){
  const referenceDescription = clean(item?.reference?.popis);
  return referenceDescription || clean(item.popis_nemovitosti) || clean(item.popis) || "Detailní informace budou doplněny.";
}

function getReferencePrice(item){
  const reference = item?.reference || {};
  const referenceType = getReferenceType(item);
  const referencePrice = clean(reference.cena);

  if(referencePrice){
    const number = Number(referencePrice);
    if(!Number.isNaN(number) && number > 0){
      return number.toLocaleString("cs-CZ") + " Kč";
    }
  }

  return referenceType;
}

function boolText(value){
  const normalized = normalize(value);
  if(!normalized) return "";
  if(normalized === "ano" || normalized === "1") return "Ano";
  if(normalized === "ne" || normalized === "0") return "Ne";
  return clean(value);
}

function formatDate(value){
  const v = clean(value);
  if(!v) return "";
  const date = v.split(" ")[0];
  const parts = date.split("-");
  if(parts.length !== 3) return v;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
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
      datumNasťehovani: formatDate(item.ready_date),
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
    type: status === "sold" ? referenceType : getCodebookValue(item.typ_nabidky),

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
    longDescription: "Tato položka slouží pouze pro otestování webu. Jakmile bude ve Vercelu vložena skutečná hodnota POSKI_XML_URL, API začne automaticky načítat reálná data a fotografie přímo z exportu.",
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
  },
  {
    id: "realizace-1",
    status: "sold",
    title: "Prodej pozemku",
    description: "Ukázka realizovaného prodeje pozemku v Olomouckém kraji.",
    longDescription: "Tato položka slouží jako ukázka realizovaného obchodu. Po napojení na Poski export se zde mohou zobrazovat skutečné prodané nebo pronajaté nemovitosti.",
    price: "Prodáno",
    city: "Olomoucký kraj",
    street: "",
    district: "Olomouc",
    region: "Olomoucký kraj",
    estateType: "Pozemek",
    type: "Prodáno",
    usableArea: "—",
    plotArea: "—",
    floor: "—",
    condition: "—",
    energyClass: "—",
    image: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1200&auto=format&fit=crop",
    gallery: ["https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1200&auto=format&fit=crop"],
    source: "fallback"
  },
  {
    id: "realizace-2",
    status: "sold",
    title: "Pronájem bytu",
    description: "Ukázka realizovaného pronájmu bytové jednotky.",
    longDescription: "Tato položka slouží jako ukázka realizovaného pronájmu. Později ji lze nahradit skutečnou realizací z exportu nebo ručně doplněnými daty.",
    price: "Pronajato",
    city: "Olomouc",
    street: "",
    district: "Olomouc",
    region: "Olomoucký kraj",
    estateType: "Byt",
    type: "Pronajato",
    usableArea: "—",
    plotArea: "—",
    floor: "—",
    condition: "—",
    energyClass: "—",
    image: FALLBACK_IMAGE,
    gallery: [FALLBACK_IMAGE],
    source: "fallback"
  },
  {
    id: "realizace-3",
    status: "sold",
    title: "Pronájem komerčního prostoru",
    description: "Ukázka realizovaného komerčního pronájmu.",
    longDescription: "Tato položka slouží jako ukázka realizovaného komerčního pronájmu. Po získání skutečných dat ji lze nahradit reálným obchodem.",
    price: "Realizováno",
    city: "Olomouc",
    street: "",
    district: "Olomouc",
    region: "Olomoucký kraj",
    estateType: "Komerční prostory",
    type: "Realizováno",
    usableArea: "—",
    plotArea: "—",
    floor: "—",
    condition: "—",
    energyClass: "—",
    image: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?q=80&w=1200&auto=format&fit=crop",
    gallery: ["https://images.unsplash.com/photo-1497366754035-f200968a6e72?q=80&w=1200&auto=format&fit=crop"],
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
  if(status === "active") return properties.filter(item => item.status === "active");
  if(status === "sold") return properties.filter(item => item.status === "sold");
  if(status === "reserved") return properties.filter(item => item.status === "reserved");
  return properties.filter(item => item.status === status);
}

function getItemsFromParsedXml(data){
  return toArray(data?.export?.nabidky?.nabidka);
}

export default async function handler(req, res){
  const FEED_URL = process.env.POSKI_XML_URL;
  const { id, status } = req.query;

  try{
    if(FEED_URL && !FEED_URL.includes("example.com")){
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
    let properties = sortProperties([...fallbackData]);

    if(id){
      const detail = properties.find(item => String(item.id) === String(id));
      if(detail) return res.status(200).json(detail);
    }

    return res.status(200).json({
      error: true,
      source: "fallback",
      message: "XML feed zatím není dostupný. Web je technicky připravený na Poski export.",
      detail: error.message,
      items: filterByStatus(properties, status)
    });
  }
}
