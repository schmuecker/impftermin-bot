const puppeteer = require('puppeteer');

const CONFIG = {
  headless: true,
};

class Crawler {
  constructor() {
    this.browser = undefined;
    this.page = undefined;
  }

  stop() {
    this.page && this.page.close();
    this.browser && this.browser.close();
  }

  async start(input, callback = console.log) {
    try {
      const { city, county, zip } = input;

      if (!this.page && !this.browser) {
        // Start function is running the first time
        callback({ started: `Impfterminsuche in ${city} gestartet` });
      }

      this.browser =
        this.browser ?? (await puppeteer.launch({ headless: CONFIG.headless }));
      this.page = this.page ?? (await this.browser.newPage());

      const page = this.page;

      await page.goto('https://www.impfterminservice.de/impftermine');
      await page.waitForTimeout(250);

      // accept cookies
      const [acceptCookies] = await page.$x(
        "//a[contains(., ' Alle auswählen ')]"
      );
      if (acceptCookies) {
        await acceptCookies.click();
      }
      await page.waitForTimeout(250);

      // Bundesland auswählen
      const [bundesland] = await page.$x(
        "//span[contains(., 'Bitte auswählen')]"
      );
      if (bundesland) {
        await bundesland.click();
      } else {
        return callback({ error: 'Kein Bundesland Dropdown gefunden' });
      }
      await page.waitForTimeout(250);

      // --> Select county
      const [countyItem] = await page.$x(`//li[contains(., '${county}')]`);
      if (countyItem) {
        await countyItem.click();
      } else {
        return callback({ error: 'Kein county item gefunden' });
      }
      await page.waitForTimeout(250);

      // Impfzentrum auswählen
      const [, impfzentrum] = await page.$x(
        "//span[contains(., 'Bitte auswählen')]"
      );
      if (impfzentrum) {
        await impfzentrum.click();
      } else {
        return callback({ error: 'Kein impfzentrum dropdown gefunden' });
      }
      await page.waitForTimeout(250);

      // --> PLZ
      const [zipItem] = await page.$x(`//li[contains(., '${zip ?? city}')]`);
      if (zipItem) {
        await zipItem.click();
      } else {
        return callback({ error: 'Kein zip dropdown gefunden' });
      }

      await page.waitForTimeout(250);

      // Zum Impfzentrum
      const [zumImpfzentrum] = await page.$x(
        "//button[contains(., 'Zum Impfzentrum')]"
      );
      if (zumImpfzentrum) {
        await zumImpfzentrum.click();
      } else {
        return callback({ error: 'Kein button to continue gefunden' });
      }

      await page.waitForTimeout(1000);

      // Warteraum...
      try {
        await page.waitForXPath(
          "//h1[contains(., 'Wurde Ihr Anspruch auf eine Corona-Schutzimpfung bereits geprüft?')]",
          { timeout: 1200000 }
        );
      } catch (error) {
        return this.start(input, callback);
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
        }
        await page.waitForTimeout(250);

        // Klick auf "Nein"
        const [neinButton] = await page.$x("//span[contains(., 'Nein')]");
        if (neinButton) {
          await neinButton.click();
        } else {
          return callback({ error: 'Kein Nein Button gefunden' });
        }
      } else {
        return callback({ error: 'Kein Anspruch Heading gefunden' });
      }

      await page.waitForXPath(
        "//div[contains(., 'Es wurden keine freien Termine')]",
        { timeout: 30000 }
      );

      // Fail wenn "Es wurden keine freien Termine"
      const [keineTermine] = await page.$x(
        "//div[contains(., 'Es wurden keine freien Termine')]"
      );
      if (keineTermine) {
        this.start(input, callback);
        return;
      } else {
        callback({
          success: `Es sind freie Termine in ${
            zip ?? city
          } verfügbar! Jetzt heißt es schnell sein.`,
        });
      }
    } catch (error) {
      this.browser && this.browser.close();
      callback({ error });
    }
  }
}

module.exports = Crawler;
