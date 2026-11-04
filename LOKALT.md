# Fortsätt i Codex på datorn

1. Installera Node.js 22 eller senare om det saknas.
2. Packa upp ZIP-filen och öppna mappen rehab-local som ett lokalt projekt i Codex.
3. Kör `npm start` i projektets terminal, eller be Codex starta appen.
4. Öppna http://localhost:5173 i webbläsaren.
5. Beskriv dina ändringar för Codex. Testerna körs med `npm test`.

Ingen npm install behövs. Redigera filerna i dist/ och ladda om sidan. Inget byggsteg behövs. Stoppa servern med Ctrl+C.

Om webbläsaren visar en gammal version kan du avregistrera appens service worker i webbläsarens utvecklarverktyg under Application/Service Workers och ladda om. Radera inte localStorage om du vill behålla historiken.

Det här paketet innehåller källkoden och övningsbilderna från Sites-versionen. Filen .openai/hosting.json är ursprunglig hostingmetadata; den behövs inte för att köra lokalt. Ingen publicering sker med npm start eller npm test.

Historiken på den tidigare sajten lagras på dess webbadress och följer inte automatiskt till localhost. Exportera den från Framsteg på originalappen om du vill spara en kopia. Paketet lägger inte till någon historikimport.

Originalkoden hämtades från commit 4cbb647. ZIP-filen innehåller ingen Git-historik eller inloggningsuppgifter. Du kan senare skapa ett eget Git-repo lokalt.
