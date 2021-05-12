const puppeteer = require('puppeteer');
var argv = require('minimist')(process.argv.slice(2));
const say = require('say');

// Replace with crawler.js
const run = async (existingBrowser, existingPage) => {
  // Command line arguments
  // Run like: $ node index.js --plz 78224 or $ node index.js --stadt=Stuttgart
  const plz = argv.plz;
  const stadt = argv.stadt ?? 'Stuttgart';
  const show = argv.show ?? true;

  console.log(
    `Suche nach Impfterminen in ${plz || stadt} mit Optionen { show: ${show} }`
  );

  const browser =
    existingBrowser ?? (await puppeteer.launch({ headless: !show }));
  const page = existingPage ?? (await browser.newPage());

  await page.goto('https://www.impfterminservice.de/impftermine');
  await page.waitForTimeout(1000);

  // accept cookies
  const [acceptCookies] = await page.$x("//a[contains(., ' Alle auswählen ')]");
  if (acceptCookies) {
    await acceptCookies.click();
  } else {
    console.warn('No cookie button found');
  }
  await page.waitForTimeout(250);

  // Bundesland auswählen --> Baden-Württemberg
  const [bundesland] = await page.$x("//span[contains(., 'Bitte auswählen')]");
  if (bundesland) {
    await bundesland.click();
  } else {
    console.warn('No Bundesland dropdown found');
  }

  await page.waitForTimeout(250);

  const [bw] = await page.$x("//li[contains(., 'Baden-Württemberg')]");
  if (bw) {
    await bw.click();
  } else {
    console.warn('No Baden-Württemberg item found');
  }

  await page.waitForTimeout(250);

  // Impfzentrum auswählen
  const [, impfzentrum] = await page.$x(
    "//span[contains(., 'Bitte auswählen')]"
  );
  if (impfzentrum) {
    await impfzentrum.click();
  } else {
    console.warn('No impfzentrum dropdown found');
  }

  await page.waitForTimeout(250);

  // --> PLZ
  const [plzItem] = await page.$x(`//li[contains(., '${plz ?? stadt}')]`);
  if (plzItem) {
    await plzItem.click();
  } else {
    console.warn('No plz dropdown found');
  }

  await page.waitForTimeout(250);

  // Zum Impfzentrum
  const [zumImpfzentrum] = await page.$x(
    "//button[contains(., 'Zum Impfzentrum')]"
  );
  if (zumImpfzentrum) {
    await zumImpfzentrum.click();
  } else {
    console.warn('No plz dropdown found');
  }

  await page.waitForTimeout(1000);

  // Warteraum...
  try {
    await page.waitForXPath(
      "//h1[contains(., 'Wurde Ihr Anspruch auf eine Corona-Schutzimpfung bereits geprüft?')]",
      { timeout: 1200000 }
    );
  } catch (error) {
    return run(browser, page);
  }

  // Wurde ihr Anspruch bereits geprüft?
  const [anspruchH1] = await page.$x(
    "//h1[contains(., 'Wurde Ihr Anspruch auf eine Corona-Schutzimpfung bereits geprüft?')]"
  );
  await page.waitForTimeout(250);
  if (anspruchH1) {
    // accept cookies
    const [acceptCookies] = await page.$x(
      "//a[contains(., ' Alle auswählen ')]"
    );
    if (acceptCookies) {
      await acceptCookies.click();
    } else {
      console.warn('No cookie button found');
    }
    await page.waitForTimeout(250);

    // Klick auf "Nein"
    const [neinButton] = await page.$x("//span[contains(., 'Nein')]");
    if (neinButton) {
      await neinButton.click();
    } else {
      console.warn('No Nein Button found');
    }
  } else {
    return console.warn('No Anspruch Heading found');
  }

  // say.speak(`Warte auf Terminliste in ${plz ?? stadt}`);

  await page.waitForXPath(
    "//div[contains(., 'Es wurden keine freien Termine')]",
    { timeout: 30000 }
  );

  // Fail wenn "Es wurden keine freien Termine"
  const [keineTermine] = await page.$x(
    "//div[contains(., 'Es wurden keine freien Termine')]"
  );
  if (keineTermine) {
    // say.speak(`Keine freien Termine in ${plz ?? stadt} verfügbar.`);
    run(browser, page);
    return;
  } else {
    say.speak(
      `Es sind freie Termine in ${
        plz ?? stadt
      } verfügbar! Jetzt heißt es schnell sein.`
    );
  }

  await page.screenshot({ path: 'Proof.png' });

  console.log(new Date().toLocaleString(), 'Done');
};

run();
