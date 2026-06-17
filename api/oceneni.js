export default async function handler(req, res){
  res.setHeader("Cache-Control", "no-store");

  if(req.method !== "POST"){
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: true, message: "Povolena je pouze metoda POST." });
  }

  try{
    const body = req.body || {};
    const required = ["name", "phone", "email", "propertyType", "intent", "location"];
    const missing = required.filter(key => !String(body[key] || "").trim());

    if(missing.length){
      return res.status(400).json({ error: true, message: "Vyplňte prosím všechna povinná pole." });
    }

    const endpoint = process.env.FORMSPREE_ENDPOINT;

    if(!endpoint){
      return res.status(202).json({
        ok: true,
        fallback: true,
        message: "Poptávka je připravená. Na produkci doporučujeme doplnit FORMSPREE_ENDPOINT ve Vercelu, aby se odesílala přímo."
      });
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        jmeno: body.name,
        telefon: body.phone,
        email: body.email,
        typ_nemovitosti: body.propertyType,
        zamer: body.intent,
        lokalita: body.location,
        zprava: body.message || "",
        zdroj: "Formulář ocenění nemovitosti – web Kamila Kopřivová"
      })
    });

    if(!response.ok){
      throw new Error(`Formspree vrátilo status ${response.status}`);
    }

    return res.status(200).json({ ok: true, message: "Poptávka byla úspěšně odeslána." });
  }catch(error){
    return res.status(500).json({ error: true, message: "Poptávku se nepodařilo odeslat.", detail: error.message });
  }
}
