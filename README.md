# De Wi-kel – slimme voorraadweergave

Werkend prototype voor de camping- en appartementenreceptie.

## Starten

1. Installeer Node.js 18 of hoger.
2. Open een terminal in deze map en voer `node server.js` uit.
3. Open `http://localhost:3000` voor het publieke e-inkscherm.
4. Open `http://localhost:3000/beheer.html` voor voorraadbeheer.

Demo-account: `receptie` met wachtwoord `wikel2026`.

De server maakt bij de eerste start `data.json` aan. Daarin blijft de voorraad bewaard na een herstart. De publieke pagina ververst elke 60 seconden en is alleen-lezen. Het beheer gebruikt beveiligde API-routes met een tijdelijke sessietoken.
