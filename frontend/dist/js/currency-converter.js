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

function updateCurrencyConverterUI() {
  const item = selectedIRSCurrency();
  const year = Number($('currencyConverterYear')?.value || currencyDataYears()[0]);
  const direction = $('currencyConverterDirection')?.value || 'foreign-to-usd';
  const rate = item?.rates?.[year];
  $('currencyConverterAmountLabel').textContent = direction === 'foreign-to-usd'
    ? `${item.code} amount to convert`
    : 'U.S. dollar amount to convert';
  $('currencyConverterRateHint').textContent = Number.isFinite(rate)
    ? `${year}: 1 USD = ${formatIRSRate(rate)} ${item.code} (${item.country} — ${item.currency})`
    : 'No IRS yearly-average rate is available for this selection.';
  calculateCurrencyConversion(false);
}

function calculateCurrencyConversion(showValidation = true) {
  try {
    const item = selectedIRSCurrency();
    const year = Number($('currencyConverterYear')?.value || currencyDataYears()[0]);
    const direction = $('currencyConverterDirection')?.value || 'foreign-to-usd';
    const rate = Number(item?.rates?.[year]);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('No IRS yearly-average rate is available for this currency and year.');
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

function populateCurrencyConverterYears() {
  const select = $('currencyConverterYear');
  const years = currencyDataYears();
  if (select.options.length !== years.length) select.replaceChildren(...years.map(y => new Option(String(y), String(y))));
  select.value = String(years[0]);
}

function showCurrencyConverter() {
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
  populateCurrencyConverterYears();
  $('currencyConverterDirection').value = 'foreign-to-usd';
  $('currencyConverterCurrency').value = IRS_YEARLY_EXCHANGE_RATES.some(item => item.code === 'EUR') ? 'EUR' : IRS_YEARLY_EXCHANGE_RATES[0].code;
  $('currencyConverterAmount').value = '0.00';
  updateCurrencyConverterUI();
  $('currencyConverterAmount').focus();
}
