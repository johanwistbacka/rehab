Rehab – ditt dagliga pass

Buildless mobilanpassad webbapp. Öppna dist/index.html via en webbserver.
HTML, CSS och JavaScript utan externa körningsberoenden.

Underlag: användarens Physiotools_Exercises.pdf. Endast övningsbilder och
övningslänkar ingår; PDF:ens person- och vårdgivarhuvud publiceras inte.
Startvärden: 45 s stretch, 3 x 10 styrkerepetitioner, 1 s upp / 3 s ner.
Knäböj räknas manuellt. En omgång där PDF:en anger 1–2.
30 s setvila och sidval är inställningar i appen, inte ordination.

Progression är frivillig och kräver tre separata genomförda dagar med
positiv uppföljning både efter passet och senare. En parameter i taget.
Maxvärden: 60 s stretch, 15 repetitioner, 5 s sänkning.
Regeln är appens upplägg, inte en medicinskt verifierad progressionsplan.

Historiken sparas i localStorage, med JSON-export. Inga analysverktyg eller
externa datatjänster används. Originalvideor öppnas hos Physiotools.
Service worker lagrar appfiler för användning efter första laddningen;
plattformens inloggning kan fortfarande kräva nätverk.

Kontroller: node tests/model.test.js
Interaktionstester kräver jsdom installerat i /tmp/rehab-tests.
node tests/interaction.cjs

Sites hjälpskript och cua_repl.js saknades i körmiljön. Git och tar används
för publicering med autentisering enbart i processminnet. Visuell
webbläsarverifiering och verklig ljudtest på iPhone återstår.
