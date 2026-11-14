// Yearly tax figures and IRS exchange rates.
//
// Updating for a new year:
//  1. Tax calculator: copy the newest entry in TAX_YEARS, change the year key
//     and update the figures (standard deduction, brackets, capital-gain
//     thresholds, Social Security wage base, Child Tax Credit, estimated-tax
//     due dates) and the sources line. The year dropdown picks it up
//     automatically and opens on the newest year.
//  2. Currency converter: when the IRS publishes a new yearly-average table,
//     add the new year to each currency's `rates`. Years with no rates are
//     simply not offered.
//  3. Run the tests: for f in frontend/tests/*.test.cjs; do node "$f"; done

const TAX_YEARS = {
  2025: {
    standardDeduction: {
      single: 15750,
      mfj: 31500,
      mfs: 15750,
      hoh: 23625,
      qss: 31500,
    },
    ordinaryBrackets: {
      single: [[11925, .10], [48475, .12], [103350, .22], [197300, .24], [250525, .32], [626350, .35], [Infinity, .37]],
      mfj: [[23850, .10], [96950, .12], [206700, .22], [394600, .24], [501050, .32], [751600, .35], [Infinity, .37]],
      mfs: [[11925, .10], [48475, .12], [103350, .22], [197300, .24], [250525, .32], [375800, .35], [Infinity, .37]],
      hoh: [[17000, .10], [64850, .12], [103350, .22], [197300, .24], [250500, .32], [626350, .35], [Infinity, .37]],
      qss: [[23850, .10], [96950, .12], [206700, .22], [394600, .24], [501050, .32], [751600, .35], [Infinity, .37]],
    },
    capitalGains: {
      single: { zeroMax: 48350, fifteenMax: 533400 },
      mfj: { zeroMax: 96700, fifteenMax: 600050 },
      mfs: { zeroMax: 48350, fifteenMax: 300000 },
      hoh: { zeroMax: 64750, fifteenMax: 566700 },
      qss: { zeroMax: 96700, fifteenMax: 600050 },
    },
    capitalLossLimit: { single: 3000, mfj: 3000, mfs: 1500, hoh: 3000, qss: 3000 },
    additionalMedicareThreshold: { single: 200000, mfj: 250000, mfs: 125000, hoh: 200000, qss: 200000 },
    socialSecurityWageBase: 176100,
    childTaxCredit: {
      perChild: 2200,
      refundablePerChild: 1700,
      earnedIncomeThreshold: 2500,
      phaseoutThreshold: { single: 200000, mfj: 400000, mfs: 200000, hoh: 200000, qss: 200000 },
    },
    estimatedTaxDueDates: ['April 15, 2025', 'June 16, 2025', 'September 15, 2025', 'January 15, 2026'],
    sources: {
      title: 'IRS references used for this 2025 calculator',
      text: 'Federal income tax rates and brackets • Publication 17 (2025) • IRS Schedule 8812 / Child Tax Credit guidance • IRS 2025 Form 1040-ES payment dates • Topic No. 409, Capital Gains and Losses • 2025 Schedule SE guidance.',
    },
  },
  2026: {
    standardDeduction: {
      single: 16100,
      mfj: 32200,
      mfs: 16100,
      hoh: 24150,
      qss: 32200,
    },
    ordinaryBrackets: {
      single: [[12400, .10], [50400, .12], [105700, .22], [201775, .24], [256225, .32], [640600, .35], [Infinity, .37]],
      mfj: [[24800, .10], [100800, .12], [211400, .22], [403550, .24], [512450, .32], [768700, .35], [Infinity, .37]],
      mfs: [[12400, .10], [50400, .12], [105700, .22], [201775, .24], [256225, .32], [384350, .35], [Infinity, .37]],
      hoh: [[17700, .10], [67450, .12], [105700, .22], [201750, .24], [256200, .32], [640600, .35], [Infinity, .37]],
      qss: [[24800, .10], [100800, .12], [211400, .22], [403550, .24], [512450, .32], [768700, .35], [Infinity, .37]],
    },
    capitalGains: {
      single: { zeroMax: 49450, fifteenMax: 545500 },
      mfj: { zeroMax: 98900, fifteenMax: 613700 },
      mfs: { zeroMax: 49450, fifteenMax: 306850 },
      hoh: { zeroMax: 66200, fifteenMax: 579600 },
      qss: { zeroMax: 98900, fifteenMax: 613700 },
    },
    capitalLossLimit: { single: 3000, mfj: 3000, mfs: 1500, hoh: 3000, qss: 3000 },
    additionalMedicareThreshold: { single: 200000, mfj: 250000, mfs: 125000, hoh: 200000, qss: 200000 },
    socialSecurityWageBase: 184500,
    childTaxCredit: {
      perChild: 2200,
      refundablePerChild: 1700,
      earnedIncomeThreshold: 2500,
      phaseoutThreshold: { single: 200000, mfj: 400000, mfs: 200000, hoh: 200000, qss: 200000 },
    },
    estimatedTaxDueDates: ['April 15, 2026', 'June 15, 2026', 'September 15, 2026', 'January 15, 2027'],
    sources: {
      title: 'References used for this 2026 calculator',
      text: 'Tax Foundation 2026 Tax Brackets • IRS Revenue Procedure 2025-32 • IRS Child Tax Credit guidance • IRS 2026 Form 1040-ES payment dates • IRS capital-gain thresholds • Social Security Administration 2026 contribution and benefit base.',
    },
  },
};

// Newest first.
function taxDataYears() {
  return Object.keys(TAX_YEARS).map(Number).sort((a, b) => b - a);
}
function latestTaxDataYear() {
  return taxDataYears()[0];
}



// IRS yearly-average currency exchange rates published at:
// https://www.irs.gov/individuals/international-taxpayers/yearly-average-currency-exchange-rates
// The IRS table expresses each rate as units of foreign currency per 1 U.S. dollar.
const IRS_YEARLY_EXCHANGE_RATES = [
  { code: 'AFN', country: 'Afghanistan', currency: 'Afghani', rates: { 2025: 69.637, 2024: 70.649, 2023: 82.635, 2022: 90.084, 2021: 83.484 } },
  { code: 'DZD', country: 'Algeria', currency: 'Dinar', rates: { 2025: 131.627, 2024: 134.124, 2023: 135.933, 2022: 142.123, 2021: 135.011 } },
  { code: 'ARS', country: 'Argentina', currency: 'Peso', rates: { 2025: 1243.369, 2024: 915.161, 2023: 296.154, 2022: 130.792, 2021: 95.098 } },
  { code: 'AUD', country: 'Australia', currency: 'Dollar', rates: { 2025: 1.551, 2024: 1.516, 2023: 1.506, 2022: 1.442, 2021: 1.332 } },
  { code: 'BHD', country: 'Bahrain', currency: 'Dinar', rates: { 2025: 0.377, 2024: 0.377, 2023: 0.377, 2022: 0.377, 2021: 0.377 } },
  { code: 'BRL', country: 'Brazil', currency: 'Real', rates: { 2025: 5.593, 2024: 5.392, 2023: 4.994, 2022: 5.165, 2021: 5.395 } },
  { code: 'CAD', country: 'Canada', currency: 'Dollar', rates: { 2025: 1.398, 2024: 1.370, 2023: 1.350, 2022: 1.301, 2021: 1.254 } },
  { code: 'KYD', country: 'Cayman Islands', currency: 'Dollar', rates: { 2025: 0.821, 2024: 0.833, 2023: 0.833, 2022: 0.833, 2021: 0.833 } },
  { code: 'CNY', country: 'China', currency: 'Yuan', rates: { 2025: 7.129, 2024: 7.189, 2023: 7.075, 2022: 6.730, 2021: 6.452 } },
  { code: 'DKK', country: 'Denmark', currency: 'Krone', rates: { 2025: 6.617, 2024: 6.896, 2023: 6.890, 2022: 7.077, 2021: 6.290 } },
  { code: 'EGP', country: 'Egypt', currency: 'Pound', rates: { 2025: 49.233, 2024: 45.345, 2023: 30.651, 2022: 19.208, 2021: 15.697 } },
  { code: 'EUR', country: 'Euro Zone', currency: 'Euro', rates: { 2025: 0.886, 2024: 0.924, 2023: 0.924, 2022: 0.951, 2021: 0.846 } },
  { code: 'HKD', country: 'Hong Kong', currency: 'Dollar', rates: { 2025: 7.796, 2024: 7.803, 2023: 7.829, 2022: 7.831, 2021: 7.773 } },
  { code: 'HUF', country: 'Hungary', currency: 'Forint', rates: { 2025: 352.869, 2024: 365.603, 2023: 353.020, 2022: 372.775, 2021: 303.292 } },
  { code: 'ISK', country: 'Iceland', currency: 'Krona', rates: { 2025: 128.262, 2024: 137.958, 2023: 137.857, 2022: 135.296, 2021: 126.986 } },
  { code: 'INR', country: 'India', currency: 'Rupee', rates: { 2025: 87.133, 2024: 83.677, 2023: 82.572, 2022: 78.598, 2021: 73.936 } },
  { code: 'IQD', country: 'Iraq', currency: 'Dinar', rates: { 2025: 1309.753, 2024: 1309.744, 2023: 1376.529, 2022: 1459.510, 2021: 1460.133 } },
  { code: 'ILS', country: 'Israel', currency: 'New Shekel', rates: { 2025: 3.451, 2024: 3.701, 2023: 3.687, 2022: 3.361, 2021: 3.232 } },
  { code: 'JPY', country: 'Japan', currency: 'Yen', rates: { 2025: 149.632, 2024: 151.353, 2023: 140.511, 2022: 131.454, 2021: 109.817 } },
  { code: 'LBP', country: 'Lebanon', currency: 'Pound', rates: { 2025: 89568.540, 2024: 78958.611, 2023: 13730.988, 2022: 1515.669, 2021: 1519.228 } },
  { code: 'MXN', country: 'Mexico', currency: 'Peso', rates: { 2025: 19.212, 2024: 18.330, 2023: 17.733, 2022: 20.110, 2021: 20.284 } },
  { code: 'MAD', country: 'Morocco', currency: 'Dirham', rates: { 2025: 9.344, 2024: 9.937, 2023: 10.134, 2022: 10.275, 2021: 8.995 } },
  { code: 'NZD', country: 'New Zealand', currency: 'Dollar', rates: { 2025: 1.719, 2024: 1.654, 2023: 1.630, 2022: 1.578, 2021: 1.415 } },
  { code: 'NOK', country: 'Norway', currency: 'Kroner', rates: { 2025: 10.392, 2024: 10.756, 2023: 10.564, 2022: 9.619, 2021: 8.598 } },
  { code: 'QAR', country: 'Qatar', currency: 'Rial', rates: { 2025: 3.643, 2024: 3.643, 2023: 3.643, 2022: 3.644, 2021: 3.644 } },
  { code: 'RUB', country: 'Russia', currency: 'Ruble', rates: { 2025: 83.755, 2024: 92.837, 2023: 85.509, 2022: 69.896, 2021: 73.686 } },
  { code: 'SAR', country: 'Saudi Arabia', currency: 'Riyal', rates: { 2025: 3.751, 2024: 3.752, 2023: 3.752, 2022: 3.755, 2021: 3.751 } },
  { code: 'SGD', country: 'Singapore', currency: 'Dollar', rates: { 2025: 1.307, 2024: 1.336, 2023: 1.343, 2022: 1.379, 2021: 1.344 } },
  { code: 'ZAR', country: 'South Africa', currency: 'Rand', rates: { 2025: 17.884, 2024: 18.326, 2023: 18.457, 2022: 16.377, 2021: 14.789 } },
  { code: 'KRW', country: 'South Korean', currency: 'Won', rates: { 2025: 1421.779, 2024: 1364.153, 2023: 1306.686, 2022: 1291.729, 2021: 1144.883 } },
  { code: 'SEK', country: 'Sweden', currency: 'Krona', rates: { 2025: 9.813, 2024: 10.577, 2023: 10.613, 2022: 10.122, 2021: 8.584 } },
  { code: 'CHF', country: 'Switzerland', currency: 'Franc', rates: { 2025: 0.831, 2024: 0.881, 2023: 0.899, 2022: 0.955, 2021: 0.914 } },
  { code: 'TWD', country: 'Taiwan', currency: 'Dollar', rates: { 2025: 31.167, 2024: 32.117, 2023: 31.160, 2022: 29.813, 2021: 27.932 } },
  { code: 'THB', country: 'Thailand', currency: 'Baht', rates: { 2025: 32.870, 2024: 35.267, 2023: 34.802, 2022: 35.044, 2021: 31.997 } },
  { code: 'TND', country: 'Tunisia', currency: 'Dinar', rates: { 2025: 2.996, 2024: 3.111, 2023: 3.103, 2022: 3.082, 2021: 2.778 } },
  { code: 'TRY', country: 'Turkey', currency: 'New Lira', rates: { 2025: 39.546, 2024: 32.867, 2023: 23.824, 2022: 16.572, 2021: 8.904 } },
  { code: 'AED', country: 'United Arab Emirates', currency: 'Dirham', rates: { 2025: 3.673, 2024: 3.673, 2023: 3.673, 2022: 3.673, 2021: 3.673 } },
  { code: 'GBP', country: 'United Kingdom', currency: 'Pound', rates: { 2025: 0.759, 2024: 0.783, 2023: 0.804, 2022: 0.811, 2021: 0.727 } },
  { code: 'VES', country: 'Venezuela', currency: 'Bolivar (Fuerte)', rates: { 2025: 13057596875331350.0, 2024: 3833558362078.0, 2023: 2863377461538.5, 2022: 666470505836.6, 2021: 232298866894.8 } },
];

// Every year that has at least one IRS rate, newest first.
function currencyDataYears() {
  const years = new Set();
  IRS_YEARLY_EXCHANGE_RATES.forEach(item => Object.keys(item.rates).forEach(y => years.add(Number(y))));
  return [...years].sort((a, b) => b - a);
}
