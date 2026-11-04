# Fortsätt i Codex på datorn

1. Installera Node.js 22 eller senare om det saknas.
2. Packa upp ZIP-filen och öppna mappen rehab-local som ett lokalt projekt i Codex.
3. Kör `npm start` i projektets terminal, eller be Codex starta appen.
4. Öppna http://localhost:5173 i webbläsaren.
5. Beskriv dina ändringar för Codex. Testerna körs med `npm test`.

Ingen npm install behövs. Redigera filerna i dist/ och ladda om sidan. Inget byggsteg behövs. Stoppa servern med Ctrl+C.

Om webbläsaren visar en gammal version kan du avregistrera appens service worker i webbläsarens utvecklarverktyg under Application/Service Workers och ladda om. Radera inte localStorage om du vill behålla historiken.

Det här paketet innehåller källkoden och övningsbilderna från Sites-versionen. Filen .openai/hosting.json är ursprunglig hostingmetadata; den behövs inte för att köra lokalt. Ingen publicering sker med npm start eller npm test.

Historiken på den tidigare sajten lagras på dess webbadress och följer inte automatiskt till localhost. Exportera den från Framsteg på originalappen om du vill spara en kopia. Importera sedan JSON-filen under Framsteg på den lokala appen. Granska förhandsvisningen innan du bekräftar. Befintlig historik behålls och dubbletter slås ihop. Upplägget ändras bara om du väljer det i importen.

Originalkoden hämtades från commit 4cbb647. ZIP-filen innehåller ingen Git-historik eller inloggningsuppgifter. Du kan senare skapa ett eget Git-repo lokalt.

Påbörjade pass sparas separat i samma webbläsare. Efter omladdning väljer du Fortsätt passet på Hem; timern återkommer pausad. Ett färdigt pass väntar kvar på ditt svar även efter omladdning. Passtiden inkluderar vila och byten, men inte pauser, tid med appen dold eller tiden innan ett återställt pass fortsätts. Äldre historik visar Passtid saknas eftersom den tiden inte mättes.

Interaktionstesterna kan köras med `node tests/interaction.cjs` om jsdom finns installerat, eller med `REHAB_JSDOM_PATH=/sökväg/till/jsdom node tests/interaction.cjs`. Grundappen och `npm test` behöver fortfarande inga installerade paket.

Ljudstöd kan slås på och av på Hem eller under passet. Testa ljud finns också i Inställningar och spelar ett kort prov utan att ändra det sparade ljudvalet eller övriga inställningar. Ett pågående pass pausas vid ljudtest. Kort signal markerar start och tempo; två toner markerar avslutad del eller vila. Ljudmotorn startas från knapptrycket innan timern går igång, och signalerna stoppas vid paus, ljud av och när appen lämnas. Om ljudet inte kan startas visas det vid ljudknapparna och timern fungerar ändå. Den hörbara volymen och vald högtalare/hörlur behöver kontrolleras på själva enheten med Testa ljud.

## På telefonen

För daglig användning är en HTTPS-adress och en genväg på hemskärmen lämpligast. Appen har redan webbappsmanifest och en service worker som sparar appfiler och aktuella bilder för offlineanvändning. Kör `npm run build` för att samla de aktuella appfilerna i `_site/`, utan de äldre bildvarianterna eller bildprompterna. GitHub Actions testar pushar till `main`; själva Pages-publiceringen startas separat genom att köra arbetsflödet Test and publish Rehab manuellt. Den avsedda adressen är `https://johanwistbacka.github.io/rehab/`. GitHub Pages måste först vara aktiverat för repot. Den nuvarande kontoplanen stöder inte Pages för det privata repot, så källkodsrepot behöver göras offentligt eller en annan publiceringslösning väljas. Användaren har valt en offentlig app utan lösenord.

På iPhone öppnar du adressen i Safari och väljer Dela → Lägg till på hemskärmen; aktivera Öppna som webbapp om alternativet visas. Håll appen synlig under passet och kontrollera ljudet med Testa ljud på telefonen. Historiken sparas lokalt på telefonen. Flytta befintlig historik med Exportera/Importera historik när du byter enhet eller webbadress.

Den lokala utvecklingsservern lyssnar endast på `127.0.0.1`, så `localhost:5173` på datorn är ingen åtkomlig mobiladress. Att lägga ut appen på en HTTPS-adress är en separat publicering och görs först på uttrycklig begäran.

Referenser: [Apple om webbappar på hemskärmen](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios), [MDN om service workers och HTTPS](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers), [GitHub om Pages och åtkomst](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

Den aktuella textfria bildserien i 50-talsstil finns i `dist/assets/illustrations/1950s/`. De tidigare versionerna är bevarade under `dist/assets/illustrations/`. Originalstillbilderna i `dist/assets/exercise-0.png` till `exercise-7.png` är också bevarade. Förstora en illustration i Program eller under ett pass och välj Visa originalbild för att jämföra. Ett pågående pass pausas när bilden öppnas. Den aktuella serien är en stilbearbetning av den manliga, textfria grundserien. Det godkända stilprovet för väggstretch används oförändrat. Prompter och förlagor finns i `output/imagegen/1950s-manifest.json`; tidigare generationers underlag finns i de övriga manifestfilerna i samma mapp. Ingen garanti om rättighetsfrihet eller juridisk bedömning av bildernas självständighet har gjorts.
