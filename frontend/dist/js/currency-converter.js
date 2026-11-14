// IRS currency converter.

function populateCurrencyConverterCurrencies() {
  const select = $('currencyConverterCurrency');
  if (!select) return;
  const previous = select.value || 'EUR';
  select.innerHTML = IRS_YEARLY_EXCHANGE_RATES
    .map(item => `<option value="${escapeHTML(item.code)}">${escapeHTML(item.country)} — ${escapeHTML(item.currency)} (${escapeHTML(item.code)})</option>`)
    .join('');
  if (IRS_YEARLY_EXCHANGE_RATES.some(item => item.code === previous)) select.value = previous;
  else if (IRS_YEARLY_EXCHANGE_RATES.some(item => item.code === 'EUR')) select.value = 'EUR';
}

function selectedIRSCurrency() {
  const code = $('currencyConverterCurrency')?.value || '';
  return IRS_YEARLY_EXCHANGE_RATES.find(item => item.code === code) || IRS_YEARLY_EXCHANGE_RATES[0];
}

function currencyConverterNumber() {
  const raw = String($('currencyConverterAmount')?.value || '').replace(/[$,\s]/g, '');
  if (!raw) return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error('Enter a valid non-negative amount to convert.');
  return value;
}

function formatIRSRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e12) return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
  return n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function formatForeignAmount(value, code) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const maximumFractionDigits = Math.abs(n) >= 1000000 ? 2 : 4;
  return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits })} ${code}`;
}

function currencyRateType() {
  return $('currencyConverterRateType')?.value === 'year-end' ? 'year-end' : 'average';
}
const CURRENCY_RATE_TYPES = {
  average: {
    name: 'IRS yearly-average rate',
    eyebrow: 'TOOLS • IRS YEARLY AVERAGE RATES',
    use: 'For income and expenses received or paid during the year.',
    source: 'Yearly average currency exchange rates — Internal Revenue Service',
    button: 'Open IRS Rate Table',
  },
  'year-end': {
    name: 'Treasury year-end rate (Dec 31)',
    eyebrow: 'TOOLS • TREASURY YEAR-END RATES',
    use: 'For FBAR maximum account values and Form 8938 year-end balances.',
    source: 'Treasury Reporting Rates of Exchange as of December 31 — Bureau of the Fiscal Service',
    button: 'Open Treasury Rate Table',
  },
};

function updateCurrencyConverterUI() {
  const type = currencyRateType();
  const info = CURRENCY_RATE_TYPES[type];
  populateCurrencyConverterYears(true);
  $('currencyConverterEyebrow').textContent = info.eyebrow;
  $('currencyConverterRateTypeHint').textContent = info.use;
  $('currencyConverterRateName').textContent = info.name;
  $('currencyConverterSourceText').textContent = info.source;
  $('currencyConverterOpenIRS').textContent = info.button;
  const item = selectedIRSCurrency();
  const year = Number($('currencyConverterYear')?.value || currencyDataYears(type)[0]);
  const direction = $('currencyConverterDirection')?.value || 'foreign-to-usd';
  const rate = currencyRate(item, year, type);
  $('currencyConverterAmountLabel').textContent = direction === 'foreign-to-usd'
    ? `${item.code} amount to convert`
    : 'U.S. dollar amount to convert';
  $('currencyConverterRateHint').textContent = Number.isFinite(rate)
    ? `${year}: 1 USD = ${formatIRSRate(rate)} ${item.code} (${item.country} — ${item.currency})`
    : `No ${info.name.replace(/ \(Dec 31\)$/, '')} is available for this selection.`;
  calculateCurrencyConversion(false);
}

function calculateCurrencyConversion(showValidation = true) {
  try {
    const item = selectedIRSCurrency();
    const type = currencyRateType();
    const year = Number($('currencyConverterYear')?.value || currencyDataYears(type)[0]);
    const direction = $('currencyConverterDirection')?.value || 'foreign-to-usd';
    const rate = currencyRate(item, year, type);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error(`No ${CURRENCY_RATE_TYPES[type].name.replace(/ \(Dec 31\)$/, '')} is available for this currency and year.`);
    const amount = currencyConverterNumber();
    let converted = 0;
    if (direction === 'foreign-to-usd') {
      converted = amount / rate;
      $('currencyConverterResultLabel').textContent = `${formatForeignAmount(amount, item.code)} converted to U.S. dollars`;
      $('currencyConverterResult').textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(converted);
      $('currencyConverterFormula').textContent = `${amount.toLocaleString('en-US')} ${item.code} ÷ ${formatIRSRate(rate)} = ${converted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    } else {
      converted = amount * rate;
      $('currencyConverterResultLabel').textContent = `${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)} converted to ${item.code}`;
      $('currencyConverterResult').textContent = formatForeignAmount(converted, item.code);
      $('currencyConverterFormula').textContent = `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD × ${formatIRSRate(rate)} = ${converted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${item.code}`;
    }
    $('currencyConverterRateDisplay').textContent = `1 USD = ${formatIRSRate(rate)} ${item.code} (${year})`;
  } catch (e) {
    if (showValidation) showError(e);
  }
}

// keepYear: stay on the chosen year when switching rate type, if it exists.
function populateCurrencyConverterYears(keepYear = false) {
  const select = $('currencyConverterYear');
  const years = currencyDataYears(currencyRateType());
  const current = Number(select.value);
  const labels = years.map(String).join(',');
  if (select.dataset.years !== labels) {
    select.replaceChildren(...years.map(y => new Option(String(y), String(y))));
    select.dataset.years = labels;
  }
  select.value = String(keepYear && years.includes(current) ? current : years[0]);
}

function showCurrencyConverter() {
  $('currencyConverterRateType').value = 'average';
  populateCurrencyConverterCurrencies();
  populateCurrencyConverterYears();
  $('currencyConverterDirection').value = 'foreign-to-usd';
  if (IRS_YEARLY_EXCHANGE_RATES.some(item => item.code === 'EUR')) $('currencyConverterCurrency').value = 'EUR';
  $('currencyConverterAmount').value = '0.00';
  $('currencyConverterBackdrop').classList.remove('hidden');
  updateCurrencyConverterUI();
  setTimeout(() => $('currencyConverterAmount').focus(), 30);
}

function hideCurrencyConverter() {
  $('currencyConverterBackdrop').classList.add('hidden');
}

function resetCurrencyConverter() {
  $('currencyConverterRateType').value = 'average';
  populateCurrencyConverterYears();
  $('currencyConverterDirection').value = 'foreign-to-usd';
  $('currencyConverterCurrency').value = IRS_YEARLY_EXCHANGE_RATES.some(item => item.code === 'EUR') ? 'EUR' : IRS_YEARLY_EXCHANGE_RATES[0].code;
  $('currencyConverterAmount').value = '0.00';
  updateCurrencyConverterUI();
  $('currencyConverterAmount').focus();
}
