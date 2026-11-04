# Lokal utveckling

Det här är en lokal kopia av Rehab-appen. Arbeta lokalt. Publicera, pusha eller ändra inte den befintliga Sites-sajten utan en uttrycklig instruktion från användaren.

Källkoden finns direkt i dist/: index.html, style.css, app.js och model.js. Mappen innehåller redigerbar källkod, trots namnet. Inget byggsteg behövs.

Starta med npm start och kör befintliga modelltester med npm test. Node.js 22 eller senare rekommenderas. Grundappen och utvecklingsservern behöver inga installerade npm-paket.

tests/interaction.cjs är ett äldre interaktionstest som kräver jsdom på en hårdkodad sökväg. Det ingår inte i npm test.

Bevara träningsprogrammets doser och beteende om användaren inte ber om ändringar. Historik finns i webbläsarens localStorage och ingår inte i källkoden.
