# Fill Anything - Chrome Extension

Auto-fill any web form with a single click. Stores your personal information locally and intelligently detects form fields to fill them automatically.

## Features

- **One-click fill** - Click the extension icon, hit "Fill All Fields", done
- **Smart field detection** - Matches fields by name, id, label, placeholder, autocomplete attribute, and aria-label
- **Multiple fill modes**:
  - **Fill All Fields** - Fills every matching field on the page
  - **Contact** - Only name, email, phone
  - **Address** - Only address fields (street, city, state, zip, country)
  - **All Visible** - All currently visible fillable fields
- **React/Vue/Angular compatible** - Uses native input value setters and dispatches proper events
- **Customizable** - Animation delays, highlight filled fields, skip disabled/readonly
- **Privacy first** - All data stored locally in your browser, never sent anywhere
- **100+ field types** - Name, email, phone, address, DOB, SSN, passport, payment, employment, education, vehicle, medical, emergency contact, and more

## Installation

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `Fill Anything` folder
5. Done! Click the extension icon on any page with a form

## Setup Your Personal Info

### Method 1: Edit personal-info.json directly

1. Open `personal-info.json` in a text editor
2. Find any field with `"enabled": true` and a `"value": "YOUR_..."` placeholder
3. Replace the placeholder with your actual information
4. Save the file
5. Go to `chrome://extensions` and click the reload icon for Fill Anything
6. Open the extension popup → Settings → Edit Personal Info to verify

### Method 2: Via the extension popup

1. Open the extension popup
2. Click "Settings" to expand
3. Click "Edit Personal Info" to view the data file
4. Modify in your editor and reload the extension

### Recommended: Start with these essential fields

In `personal-info.json`, set `enabled: true` and fill in `value` for:

- `firstName` - Your first name
- `lastName` - Your last name
- `email` - Your primary email
- `phone` - Your phone number
- `addressLine1` - Your street address
- `city` - Your city
- `state` - Your state/province
- `zipCode` - Your ZIP/postal code
- `country` - Your country

## Personal Info Fields Reference

The `personal-info.json` file includes fields for:

**Identity**: firstName, lastName, fullName, middleName, namePrefix, nickname, fullName

**Contact**: email, emailSecondary, phone, phoneSecondary, phoneCountryCode

**Address**: addressLine1, addressLine2, city, state, stateCode, zipCode, country, countryCode

**Personal**: dob, dobDay, dobMonth, dobYear, age, gender, pronouns, nationality, language, timezone

**Government ID**: ssn, passportNumber, passportExpiry, driversLicense, driverLicenseState

**Employment**: occupation, employer, employerAddress, workPhone, workEmail, annualIncome, company

**Education**: educationLevel, school, graduationYear

**Online**: website, linkedin, twitter, github, username

**Shipping**: shippingFirstName, shippingLastName, shippingPhone, shippingEmail

**Billing**: billingFirstName, billingLastName, billingPhone, billingEmail

**Payment**: cardNumber, cardExpiry, cardExpiryMonth, cardExpiryYear, cardCvv, cardName, iban, routingNumber

**Additional**: notes, howDidYouHear, referralCode, maritalStatus, vatNumber

**Vehicle**: vehicleMake, vehicleModel, vehicleYear, vin, licensePlate

**Emergency**: emergencyContactName, emergencyContactPhone, emergencyContactRelation

**Medical**: bloodType, insuranceProvider, insurancePolicyNumber

Each field includes:
- `enabled` - Set to true to fill this field, false to skip
- `value` - Your actual data
- `fieldNames` - HTML name/id attributes the field matches against
- `inputTypes` - HTML input types it matches
- `labels` - Text labels it matches against

## How Field Matching Works

Fields are scored based on how well they match:
- **+15 points** - autocomplete attribute match (highest priority)
- **+10 points** - name/id attribute match
- **+8 points** - label text match
- **+6 points** - aria-label match
- **+5 points** - placeholder text match
- **+2 points** - input type match
- **-15 points** - exclusion match (avoids wrong matches)

A field needs at least **3 points** to be matched. Best match wins.

## Development

### File Structure
```
Fill Anything/
├── manifest.json           # Extension manifest (v3)
├── background.js           # Background service worker
├── personal-info.json      # Your personal information
├── content/
│   └── content.js          # Injected into pages for form detection
├── popup/
│   ├── popup.html          # Extension popup UI
│   ├── popup.css           # Popup styles
│   └── popup.js            # Popup logic
└── icons/
    ├── icon16.png          # 16x16 icon
    ├── icon48.png          # 48x48 icon
    └── icon128.png         # 128x128 icon
```

### Testing

1. Load the extension in Chrome developer mode
2. Navigate to a page with forms (e.g., Google Forms, any sign-up page)
3. Open the extension popup
4. Verify form field detection count
5. Click "Fill All Fields"
6. Verify fields are highlighted and filled

### Adding Custom Field Mappings

Edit the `FIELD_DATABASE` in `content/content.js` to add new field types. Follow the existing pattern:

```javascript
myNewField: {
  names: ['field_name', 'fieldName', 'field-name'],
  types: ['text'],
  labels: ['Field Label', 'label text'],
  exclusions: ['field_to_avoid'] // optional
}
```

## Privacy

All data is stored locally in your browser using `chrome.storage.local`. Nothing is ever sent to any server.
