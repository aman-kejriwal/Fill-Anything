// Content script for Fill Anything Chrome Extension
// Injected into all pages - detects and fills form fields

(function() {
  'use strict';

  // Prevent double injection
  if (window.__fillAnythingInjected) return;
  window.__fillAnythingInjected = true;

  // Personal info data storage key
  const STORAGE_KEY = 'fillAnythingPersonalInfo';
  const HIGHLIGHT_CLASS = 'fill-anything-highlight';

  // We'll use a simple key-value map for matching
  // This is populated from the personal-info.json data
  let personalInfoMap = {};
  let personalInfoLoaded = false;

  // The comprehensive field matching database
  const FIELD_DATABASE = {
    firstName: {
      names: ['fname', 'firstName', 'first_name', 'first-name', 'firstname', 'given-name', 'givenName', 'given_name'],
      types: ['text'],
      labels: ['first name', 'firstname', 'first', 'given name']
    },
    lastName: {
      names: ['lname', 'lastName', 'last_name', 'last-name', 'lastname', 'family-name', 'familyName', 'family_name', 'surname'],
      types: ['text'],
      labels: ['last name', 'lastname', 'last', 'surname', 'family name']
    },
    fullName: {
      names: ['name', 'fullName', 'full_name', 'fullname', 'full-name', 'your-name', 'yourName', 'customerName', 'customer_name', 'applicantName', 'applicant_name'],
      types: ['text'],
      labels: ['full name', 'your name', 'name'],
      exclusions: ['username', 'firstname', 'lastname', 'cardname', 'cardholder', 'card'] // avoid matching these
    },
    email: {
      names: ['email', 'e-mail', 'emailAddress', 'email_address', 'email-address', 'userEmail', 'user_email', 'loginEmail', 'mail'],
      types: ['email', 'text'],
      labels: ['email', 'e-mail', 'email address']
    },
    phone: {
      names: ['phone', 'telephone', 'tel', 'phoneNumber', 'phone_number', 'phone-number', 'mobile', 'mobileNumber', 'mobile_number', 'cell', 'cellPhone', 'cell_number', 'contactNumber', 'contact_number', 'homePhone', 'home_phone', 'phoneMain'],
      types: ['tel', 'text', 'phone'],
      labels: ['phone', 'phone number', 'mobile', 'cell', 'telephone', 'contact number', 'mobile number']
    },
    addressLine1: {
      names: ['address', 'address1', 'addressLine1', 'address_line_1', 'address-line-1', 'street', 'streetAddress', 'street_address', 'street-address', 'addr1', 'addrLine1', 'addr_1', 'address_1', 'line1', 'line_1', 'shippingAddress', 'shipping_address', 'mailingAddress'],
      types: ['text'],
      labels: ['address', 'address line 1', 'street address', 'address 1', 'street', 'mailing address']
    },
    addressLine2: {
      names: ['address2', 'addressLine2', 'address_line_2', 'address-line-2', 'street2', 'addr2', 'addrLine2', 'addr_2', 'address_2', 'line2', 'line_2', 'apt', 'apartment', 'suite', 'unit', 'building', 'floor'],
      types: ['text'],
      labels: ['address line 2', 'address 2', 'apt', 'apartment', 'suite', 'unit', 'building']
    },
    city: {
      names: ['city', 'town', 'cityName', 'city_name', 'suburb'],
      types: ['text'],
      labels: ['city', 'town', 'suburb']
    },
    state: {
      names: ['state', 'province', 'region', 'stateName', 'state_name', 'stateProvince', 'state_province', 'administrativeArea', 'administrative_area'],
      types: ['text', 'select-one'],
      labels: ['state', 'province', 'region']
    },
    zipCode: {
      names: ['zip', 'zipCode', 'zip_code', 'zipcode', 'postalCode', 'postal_code', 'postal-code', 'postcode', 'pinCode', 'pin_code', 'pincode'],
      types: ['text'],
      labels: ['zip', 'zip code', 'postal code', 'postcode', 'pin code']
    },
    country: {
      names: ['country', 'countryName', 'country_name'],
      types: ['text', 'select-one'],
      labels: ['country']
    },
    dob: {
      names: ['dob', 'dateOfBirth', 'date_of_birth', 'date-of-birth', 'birthDate', 'birth_date', 'birthdate', 'birth-date'],
      types: ['date', 'text'],
      labels: ['date of birth', 'birth date', 'dob']
    },
    ssn: {
      names: ['ssn', 'socialSecurity', 'social_security', 'social-security', 'socialSecurityNumber', 'social_security_number', 'nationalId', 'national_id', 'ssNumber', 'ss_number'],
      types: ['text', 'password'],
      labels: ['ssn', 'social security number', 'national id']
    },
    occupation: {
      names: ['occupation', 'jobTitle', 'job_title', 'job-title', 'profession', 'role', 'designation', 'workTitle', 'work_title', 'career'],
      types: ['text'],
      labels: ['occupation', 'job title', 'profession', 'role', 'designation']
    },
    employer: {
      names: ['employer', 'company', 'companyName', 'company_name', 'company-name', 'employerName', 'employer_name', 'workplace', 'organization', 'organizationName', 'orgName'],
      types: ['text'],
      labels: ['employer', 'company', 'organization', 'company name', 'workplace']
    },
    website: {
      names: ['website', 'webSite', 'web_site', 'url', 'homepage', 'personalWebsite', 'personal_website', 'site', 'webAddress', 'web_address', 'portfolio', 'blog', 'blogUrl'],
      types: ['url', 'text'],
      labels: ['website', 'url', 'homepage', 'personal website', 'blog', 'portfolio']
    },
    username: {
      names: ['username', 'userName', 'user_name', 'user-name', 'login', 'loginId', 'login_id', 'accountId', 'account_id', 'account', 'screenName', 'screen_name', 'handle', 'userId', 'user_id', 'memberId', 'member_id'],
      types: ['text'],
      labels: ['username', 'login', 'user name', 'account id', 'screen name']
    },
    cardNumber: {
      names: ['cardNumber', 'card_number', 'cardnumber', 'card-number', 'ccNumber', 'cc_number', 'cc-number', 'creditCard', 'credit_card', 'credit-card', 'ccNo', 'cc_no', 'pan', 'paymentCard'],
      types: ['text', 'tel'],
      labels: ['card number', 'credit card number', 'cc number']
    },
    cardExpiry: {
      names: ['expiry', 'expiryDate', 'expiry_date', 'expiry-date', 'expiration', 'expirationDate', 'expiration_date', 'expiration-date', 'expDate', 'exp_date', 'cardExpiry', 'card_expiry', 'card-expiry', 'ccExpiry', 'cc_expiry', 'validThru', 'valid_thru'],
      types: ['text', 'month'],
      labels: ['expiry date', 'expiration date', 'exp date', 'valid thru']
    },
    cardCvv: {
      names: ['cvv', 'cvc', 'cvv2', 'cid', 'cvd', 'securityCode', 'security_code', 'security-code', 'cardCode', 'card_code', 'ccCvv', 'cc_cvv', 'ccCvc', 'cc_cvc', 'csc'],
      types: ['text', 'password', 'tel', 'number'],
      labels: ['cvv', 'cvc', 'security code', 'card code']
    },
    cardName: {
      names: ['cardName', 'card_name', 'card-name', 'cardholderName', 'cardholder_name', 'cardholder-name', 'cardHolder', 'ccName', 'cc_name', 'nameOnCard', 'name_on_card', 'name-on-card'],
      types: ['text'],
      labels: ['name on card', 'cardholder name', 'card name']
    },
    notes: {
      names: ['notes', 'comments', 'additionalInfo', 'additional_info', 'additional-info', 'extraInfo', 'extra_info', 'message', 'description', 'remarks', 'instructions', 'specialInstructions', 'orderNotes', 'order_notes'],
      types: ['textarea'],
      labels: ['notes', 'comments', 'additional info', 'instructions', 'order notes', 'remarks']
    },
    gender: {
      names: ['gender', 'sex'],
      types: ['text', 'select-one', 'radio'],
      labels: ['gender', 'sex']
    },
    dobDay: {
      names: ['dobday', 'dob_day', 'dob-day', 'birthday', 'birth_day', 'birth-day', 'birthdate_day', 'day'],
      types: ['text', 'select-one', 'number'],
      labels: ['day', 'birth day', 'dob day']
    },
    dobMonth: {
      names: ['dobmonth', 'dob_month', 'dob-month', 'birthmonth', 'birth_month', 'birth-month', 'birthdate_month', 'month'],
      types: ['text', 'select-one', 'number'],
      labels: ['month', 'birth month', 'dob month']
    },
    dobYear: {
      names: ['dobyear', 'dob_year', 'dob-year', 'birthyear', 'birth_year', 'birth-year', 'birthdate_year', 'year'],
      types: ['text', 'select-one', 'number'],
      labels: ['year', 'birth year', 'dob year']
    }
  };

  // Map of mode -> list of field keys to fill
  const MODE_MAP = {
    'all': Object.keys(FIELD_DATABASE),
    'contact': ['firstName', 'lastName', 'fullName', 'email', 'phone'],
    'address': ['addressLine1', 'addressLine2', 'city', 'state', 'zipCode', 'country'],
    'visible': null // fill whatever's visible and matches
  };

  // ------ CORE FUNCTIONS ------

  // Helper to check if data contains any non-placeholder values
  function hasConfiguredData(data) {
    if (!data) return false;
    const info = data.personalInfo || data;
    if (!info || typeof info !== 'object') return false;

    const PLACEHOLDER_PATTERNS = [
      'YOUR_', 'APT_', 'SUITE_', 'UNIT_', 'EMERGENCY_CONTACT_',
      'YYYY-MM-DD', 'MM/YY', 'DD', 'MM', 'YYYY', 'Select...'
    ];

    return Object.entries(info).some(([key, fieldDef]) => {
      if (key.startsWith('//') || key === 'customFieldMappings') return false;
      if (fieldDef && typeof fieldDef === 'object' && fieldDef.enabled !== false && fieldDef.value) {
        const val = fieldDef.value;
        if (val && val !== '') {
          const isPlaceholder = PLACEHOLDER_PATTERNS.some(p => val.startsWith(p) || val === p);
          return !isPlaceholder;
        }
      }
      return false;
    });
  }

  // Load personal info from storage or use defaults
  async function loadPersonalInfo() {
    try {
      // Try loading from the extension's personal-info.json via fetch first
      let fileData = null;
      try {
        const url = chrome.runtime.getURL('personal-info.json');
        const resp = await fetch(url + '?t=' + Date.now(), { cache: 'no-cache' });
        if (resp.ok) {
          fileData = await resp.json();
        }
      } catch (e) {
        console.warn('[Fill Anything] Could not fetch personal-info.json:', e);
      }

      // If the file contains configured data, use it and sync to storage
      if (fileData && hasConfiguredData(fileData)) {
        buildMap(fileData);
        personalInfoLoaded = true;
        if (chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ [STORAGE_KEY]: fileData });
        }
        console.log('[Fill Anything] Loaded and synced from extension URL:', Object.keys(personalInfoMap).length, 'fields');
        return;
      }

      // Try chrome.storage second
      if (chrome.storage && chrome.storage.local) {
        const result = await new Promise(resolve => {
          chrome.storage.local.get([STORAGE_KEY], resolve);
        });
        if (result && result[STORAGE_KEY]) {
          buildMap(result[STORAGE_KEY]);
          personalInfoLoaded = true;
          console.log('[Fill Anything] Loaded from chrome.storage:', Object.keys(personalInfoMap).length, 'fields');
          return;
        }
      }

      // Try localStorage third (mainly for fallback/testing)
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        buildMap(JSON.parse(stored));
        personalInfoLoaded = true;
        console.log('[Fill Anything] Loaded from localStorage:', Object.keys(personalInfoMap).length, 'fields');
        return;
      }

      // Fallback: use the file data even if it contains placeholders
      if (fileData) {
        buildMap(fileData);
        personalInfoLoaded = true;
        console.log('[Fill Anything] Loaded default/placeholder file:', Object.keys(personalInfoMap).length, 'fields');
        return;
      }

      personalInfoLoaded = true;
      console.warn('[Fill Anything] No personal info found in any source');
    } catch (e) {
      console.error('[Fill Anything] Error loading personal info:', e);
      personalInfoLoaded = true;
    }
  }

  function buildMap(data) {
    personalInfoMap = {};
    const info = data.personalInfo || data;

    // Known placeholder patterns to skip
    const PLACEHOLDER_PATTERNS = [
      'YOUR_', 'APT_', 'SUITE_', 'UNIT_', 'EMERGENCY_CONTACT_',
      'YYYY-MM-DD', 'MM/YY', 'DD', 'MM', 'YYYY', 'Select...'
    ];

    for (const [key, fieldDef] of Object.entries(info)) {
      if (key.startsWith('//') || key === 'customFieldMappings') continue;
      if (fieldDef && typeof fieldDef === 'object' && fieldDef.enabled !== false && fieldDef.value) {
        const val = fieldDef.value;
        if (val && val !== '') {
          // Skip if value matches any placeholder pattern
          const isPlaceholder = PLACEHOLDER_PATTERNS.some(p => val.startsWith(p) || val === p);
          if (!isPlaceholder) {
            personalInfoMap[key] = val;
          }
        }
      }
    }

    // Auto-derive dobDay, dobMonth, dobYear from dob if they are not already set
    if (personalInfoMap['dob']) {
      const dateObj = parseDate(personalInfoMap['dob']);
      if (dateObj && !isNaN(dateObj.getTime())) {
        if (!personalInfoMap['dobDay']) {
          personalInfoMap['dobDay'] = String(dateObj.getDate());
        }
        if (!personalInfoMap['dobMonth']) {
          personalInfoMap['dobMonth'] = String(dateObj.getMonth() + 1);
        }
        if (!personalInfoMap['dobYear']) {
          personalInfoMap['dobYear'] = String(dateObj.getFullYear());
        }
      }
    }
  }

  // Get all fillable fields on the page
  function getFillableFields() {
    const inputs = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="reset"]):not([type="file"]), select, textarea'
    );
    return Array.from(inputs).filter(el => {
      // Must be visible
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      return true;
    });
  }

  // Score how well a field matches a data key
  function scoreMatch(element, dataKey) {
    const db = FIELD_DATABASE[dataKey];
    if (!db) return 0;

    let score = 0;
    const attrs = getElementAttributes(element);

    // Check input type match
    if (db.types.includes(element.type)) {
      score += 2;
    }

    // Check name/id attribute
    for (const fieldName of db.names) {
      if (attrs.nameLower.includes(fieldName.toLowerCase()) ||
          attrs.idLower.includes(fieldName.toLowerCase()) ||
          attrs.autocomplete.toLowerCase() === fieldName.toLowerCase()) {
        score += 10;
        break;
      }
    }

    // Check label text
    const labelText = getLabelText(element);
    for (const label of db.labels) {
      if (labelText.includes(label.toLowerCase())) {
        score += 8;
        break;
      }
    }

    // Check placeholder
    if (attrs.placeholder) {
      for (const label of db.labels) {
        if (attrs.placeholder.includes(label.toLowerCase())) {
          score += 5;
          break;
        }
      }
    }

    // Check aria-label
    if (attrs.ariaLabel) {
      for (const label of db.labels) {
        if (attrs.ariaLabel.includes(label.toLowerCase())) {
          score += 6;
          break;
        }
      }
    }

    // Exclusions (e.g., don't match "username" as "fullName")
    if (db.exclusions) {
      for (const excl of db.exclusions) {
        if (attrs.nameLower.includes(excl) || attrs.idLower.includes(excl)) {
          score -= 15;
        }
      }
    }

    // autocomplete attribute match
    const acMap = {
      firstName: ['given-name'],
      lastName: ['family-name'],
      fullName: ['name'],
      email: ['email'],
      phone: ['tel', 'tel-national'],
      addressLine1: ['address-line1', 'street-address'],
      addressLine2: ['address-line2'],
      city: ['address-level2'],
      state: ['address-level1'],
      zipCode: ['postal-code'],
      country: ['country', 'country-name'],
      cardNumber: ['cc-number'],
      cardExpiry: ['cc-exp'],
      cardCvv: ['cc-csc'],
      cardName: ['cc-name'],
      username: ['username'],
      dob: ['bday'],
      gender: ['sex'],
      ssn: ['ssn']
    };

    if (acMap[dataKey]) {
      for (const ac of acMap[dataKey]) {
        if (attrs.autocomplete === ac) {
          score += 15;
          break;
        }
      }
    }

    return score;
  }

  function getElementAttributes(element) {
    return {
      name: element.name || '',
      nameLower: (element.name || '').toLowerCase(),
      id: element.id || '',
      idLower: (element.id || '').toLowerCase(),
      placeholder: (element.placeholder || '').toLowerCase(),
      autocomplete: (element.getAttribute('autocomplete') || '').toLowerCase(),
      ariaLabel: (element.getAttribute('aria-label') || '').toLowerCase(),
      className: (element.className || '').toLowerCase()
    };
  }

  function getLabelText(element) {
    // Method 1: <label for="id">
    if (element.id) {
      const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (label) return label.textContent.toLowerCase().trim();
    }

    // Method 2: Parent <label>
    const parentLabel = element.closest('label');
    if (parentLabel) return parentLabel.textContent.toLowerCase().trim();

    // Method 3: aria-labelledby
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const ref = document.getElementById(labelledBy);
      if (ref) return ref.textContent.toLowerCase().trim();
    }

    // Method 4: Previous sibling text node or element
    const parent = element.parentElement;
    if (parent) {
      const prev = element.previousElementSibling;
      if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN' || prev.tagName === 'DIV') && prev.textContent.trim().length < 60) {
        return prev.textContent.toLowerCase().trim();
      }
    }

    return '';
  }

  // Determine the best data key for a field
  function findBestMatch(element, mode) {
    const candidates = MODE_MAP[mode] || Object.keys(FIELD_DATABASE);
    let bestKey = null;
    let bestScore = 0;

    for (const key of candidates) {
      // Only consider keys we have data for
      if (!personalInfoMap[key]) continue;

      const score = scoreMatch(element, key);
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }

    return bestScore >= 3 ? { key: bestKey, score: bestScore } : null;
  }

  // Set a value on an element, mimicking user input
  function setFieldValue(element, value) {
    if (!element || value === undefined || value === null) return false;

    try {
      // Handle select elements
      if (element.tagName === 'SELECT') {
        const options = Array.from(element.options);
        const valLower = value.toLowerCase().trim();

        // Pass 1: Exact match on value or text
        let match = options.find(opt =>
          opt.value.toLowerCase().trim() === valLower ||
          opt.text.toLowerCase().trim() === valLower
        );

        // Pass 2: Fuzzy matches for specific fields
        if (!match) {
          const labelText = getLabelText(element);
          const nameOrId = (element.id + ' ' + element.name).toLowerCase();
          const attrs = getElementAttributes(element);
          const contextText = (nameOrId + ' ' + labelText + ' ' + attrs.autocomplete + ' ' + attrs.className + ' ' + attrs.placeholder).toLowerCase();

          // 2a. Country mapping
          if (contextText.includes('country') || contextText.includes('nation')) {
            const countryMap = {
              'india': 'in', 'in': 'india', 'ind': 'india',
              'united states': 'us', 'us': 'united states', 'usa': 'united states',
              'united kingdom': 'uk', 'uk': 'united kingdom', 'gb': 'united kingdom', 'great britain': 'united kingdom', 'gbr': 'united kingdom',
              'canada': 'ca', 'ca': 'canada', 'can': 'canada',
              'australia': 'au', 'au': 'australia', 'aus': 'australia'
            };
            const mappedVal = countryMap[valLower];
            if (mappedVal) {
              match = options.find(opt =>
                opt.value.toLowerCase().trim() === mappedVal ||
                opt.text.toLowerCase().trim() === mappedVal
              );
            }
          }

          // 2b. Gender mapping
          if (!match && (contextText.includes('gender') || contextText.includes('sex'))) {
            const genderMap = {
              'male': 'm', 'm': 'male',
              'female': 'f', 'f': 'female',
              'other': 'o', 'o': 'other'
            };
            const mappedVal = genderMap[valLower];
            if (mappedVal) {
              match = options.find(opt =>
                opt.value.toLowerCase().trim() === mappedVal ||
                opt.text.toLowerCase().trim() === mappedVal
              );
            }
          }

          // 2c. Month mapping
          if (!match && contextText.includes('month')) {
            const monthIndex = parseInt(value, 10);
            if (!isNaN(monthIndex) && monthIndex >= 1 && monthIndex <= 12) {
              const monthNames = [
                ['january', 'jan', '01', '1'],
                ['february', 'feb', '02', '2'],
                ['march', 'mar', '03', '3'],
                ['april', 'apr', '04', '4'],
                ['may', '05', '5'],
                ['june', 'jun', '06', '6'],
                ['july', 'jul', '07', '7'],
                ['august', 'aug', '08', '8'],
                ['september', 'sep', '09', '9'],
                ['october', 'oct', '10'],
                ['november', 'nov', '11'],
                ['december', 'dec', '12']
              ];
              const allowed = monthNames[monthIndex - 1];
              match = options.find(opt => {
                const optVal = opt.value.toLowerCase().trim();
                const optText = opt.text.toLowerCase().trim();
                return allowed.includes(optVal) || allowed.includes(optText);
              });
            }
          }

          // 2d. Day mapping
          if (!match && (contextText.includes('day') || contextText.includes('date'))) {
            const dayVal = parseInt(value, 10);
            if (!isNaN(dayVal) && dayVal >= 1 && dayVal <= 31) {
              match = options.find(opt => {
                const optVal = parseInt(opt.value, 10);
                const optText = parseInt(opt.text, 10);
                return optVal === dayVal || optText === dayVal;
              });
            }
          }

          // 2e. Year mapping
          if (!match && contextText.includes('year')) {
            const yearVal = parseInt(value, 10);
            if (!isNaN(yearVal)) {
              match = options.find(opt => {
                const optVal = parseInt(opt.value, 10);
                const optText = parseInt(opt.text, 10);
                return optVal === yearVal || optText === yearVal ||
                       (optVal === yearVal % 100) || (optText === yearVal % 100);
              });
            }
          }
        }

        // Pass 3: Substring matching (case-insensitive)
        if (!match) {
          match = options.find(opt => {
            const optVal = opt.value.toLowerCase().trim();
            const optText = opt.text.toLowerCase().trim();
            if (valLower.length > 2) {
              return optVal.includes(valLower) || valLower.includes(optVal) ||
                     optText.includes(valLower) || valLower.includes(optText);
            } else {
              return optVal === valLower || optText === valLower;
            }
          });
        }

        if (match) {
          element.value = match.value;
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }

      // Handle radio buttons
      if (element.type === 'radio') {
        const valLower = value.toLowerCase().trim();
        const elValLower = element.value.toLowerCase().trim();
        
        let isMatch = elValLower === valLower;
        
        if (!isMatch) {
          const labelText = getLabelText(element);
          if (labelText) {
            isMatch = labelText.toLowerCase().trim() === valLower;
          }
        }
        
        // Fuzzy matches for gender radio buttons
        if (!isMatch && (element.name.toLowerCase().includes('gender') || element.name.toLowerCase().includes('sex') || element.id.toLowerCase().includes('gender') || element.id.toLowerCase().includes('sex'))) {
          const genderMap = {
            'male': ['m', 'male'],
            'female': ['f', 'female'],
            'other': ['o', 'other']
          };
          const allowed = genderMap[valLower];
          if (allowed) {
            isMatch = allowed.includes(elValLower) || allowed.includes(getLabelText(element).toLowerCase().trim());
          }
        }

        if (isMatch) {
          element.checked = true;
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }

      // Focus the element
      element.focus();

      // Native input setter for React/Vue/Angular compatibility
      // Try HTMLInputElement first, then HTMLTextAreaElement
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, 'value'
      )?.set;
      const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype, 'value'
      )?.set;

      if (element.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
        nativeTextAreaValueSetter.call(element, value);
      } else if (nativeInputValueSetter) {
        nativeInputValueSetter.call(element, value);
      } else {
        element.value = value;
      }

      // Dispatch events
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));

      return true;
    } catch (e) {
      return false;
    }
  }

  // Highlight a filled field
  function highlightField(element, enabled) {
    if (enabled) {
      element.classList.add(HIGHLIGHT_CLASS);
      element.style.outline = '2px solid #4F46E5';
      element.style.outlineOffset = '1px';
      element.style.transition = 'outline 0.2s ease';
    }
  }

  // Remove all highlights
  function clearHighlights() {
    document.querySelectorAll('.' + HIGHLIGHT_CLASS).forEach(el => {
      el.classList.remove(HIGHLIGHT_CLASS);
      el.style.outline = '';
      el.style.outlineOffset = '';
    });
  }

  // ---------- FUZZY FALLBACK LOGIC ----------
  // For fields that don't match exactly, try to fill with best-guess data

  // Keyword buckets — each maps to a personalInfoMap key
  const FALLBACK_KEYWORDS = {
    name: ['name', 'nombre', 'nom', 'namn'],
    firstName: ['first', 'fname', 'given'],
    lastName: ['last', 'lname', 'surname', 'family'],
    email: ['email', 'e-mail', 'mail', 'correo', 'courriel'],
    phone: ['phone', 'tel', 'mobile', 'cell', 'fax', 'telephone', 'whatsapp'],
    address: ['address', 'addr', 'street', 'road', 'ave', 'lane', 'drive', 'blvd', 'rd', 'st'],
    city: ['city', 'town', 'suburb', 'municipality'],
    state: ['state', 'province', 'region', 'county', 'territory'],
    zip: ['zip', 'postal', 'postcode', 'pin code', 'pincode'],
    country: ['country', 'nation', 'nationality', 'citizenship'],
    dob: ['birth', 'dob', 'born', 'birthday', 'birthdate', 'date of birth', 'bday', 'age'],
    gender: ['gender', 'sex', 'pronoun'],
    profession: ['job', 'occupation', 'profession', 'title', 'role', 'designation', 'position', 'career'],
    company: ['company', 'employer', 'organization', 'org', 'firm', 'workplace', 'business'],
    website: ['website', 'web', 'url', 'homepage', 'portfolio', 'blog', 'site'],
    username: ['username', 'login', 'handle', 'userid', 'screen name', 'account id'],
    card: ['card', 'cc', 'credit', 'debit', 'payment'],
    notes: ['note', 'comment', 'message', 'remark', 'instruction', 'description', 'additional', 'extra'],
    ssn: ['ssn', 'social', 'national id', 'tax id', 'tin', 'pan'],
    passport: ['passport'],
    license: ['license', 'licence', 'dl', 'driving'],
    vehicle: ['vehicle', 'car', 'auto', 'vin', 'license plate', 'registration'],
    emergency: ['emergency', 'ice', 'contact person', 'next of kin'],
    insurance: ['insurance', 'policy', 'provider', 'carrier', 'health'],
    language: ['language', 'lang', 'locale'],
    timezone: ['timezone', 'time zone', 'tz'],
    marital: ['marital', 'married', 'spouse', 'civil status'],
    referral: ['referral', 'referrer', 'promo', 'coupon', 'voucher', 'discount', 'how did you hear', 'source']
  };

  // Input type → personalInfoMap key mapping (type-based guessing)
  const TYPE_TO_KEY = {
    email: 'email',
    tel: 'phone',
    url: 'website',
    date: 'dob',
    number: null,  // ambiguous, handled by name/label
    'select-one': null  // handled by name/label
  };

  // Fuzzy match: find the best personalInfoMap key for a field using keyword + type heuristics
  function fuzzyMatch(element) {
    const attrs = getElementAttributes(element);
    const labelText = getLabelText(element);
    const searchText = (attrs.nameLower + ' ' + attrs.idLower + ' ' + attrs.placeholder + ' ' + labelText + ' ' + attrs.ariaLabel + ' ' + attrs.className).toLowerCase();
    const inputType = element.type;

    let bestKey = null;
    let bestScore = 0;
    let matchType = 'none';

    // Strategy 1: Keyword matching against FALLBACK_KEYWORDS
    for (const [dataKey, keywords] of Object.entries(FALLBACK_KEYWORDS)) {
      if (!personalInfoMap[dataKey]) continue;
      for (const keyword of keywords) {
        if (searchText.includes(keyword)) {
          // Score based on how specific the keyword match is
          // Longer keywords = more specific = higher score
          const keywordScore = keyword.length;
          if (keywordScore > bestScore) {
            bestScore = keywordScore;
            bestKey = dataKey;
            matchType = 'keyword';
          }
        }
      }
    }

    // Strategy 2: Input type → key mapping (lower priority than keyword)
    if (TYPE_TO_KEY[inputType] && personalInfoMap[TYPE_TO_KEY[inputType]]) {
      const typeKey = TYPE_TO_KEY[inputType];
      // Only use type-based guess if we don't already have a keyword match
      if (!bestKey) {
        bestKey = typeKey;
        bestScore = 1; // low score — type alone is weak signal
        matchType = 'type';
      }
    }

    // Strategy 3: Partial name matching — if field name contains a data key name
    if (!bestKey) {
      for (const dataKey of Object.keys(personalInfoMap)) {
        if (searchText.includes(dataKey.toLowerCase())) {
          bestKey = dataKey;
          bestScore = 2;
          matchType = 'partial';
          break;
        }
      }
    }

    if (bestKey && bestScore > 0) {
      return { key: bestKey, score: bestScore, matchType: matchType };
    }
    return null;
  }

  // Parse a date string into a Date object
  function parseDate(dateStr) {
    if (!dateStr) return null;
    
    // Try native Date.parse
    let timestamp = Date.parse(dateStr);
    if (!isNaN(timestamp)) {
      return new Date(timestamp);
    }

    // Try custom parsing for common formats (e.g. DD/MM/YYYY)
    const parts = dateStr.split(/[-/.]/);
    if (parts.length === 3) {
      // Check if first part is year (YYYY-MM-DD)
      if (parts[0].length === 4) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        return new Date(y, m, d);
      }
      // Check if last part is year (DD/MM/YYYY or MM/DD/YYYY)
      if (parts[2].length === 4) {
        const y = parseInt(parts[2], 10);
        const p1 = parseInt(parts[0], 10);
        const p2 = parseInt(parts[1], 10);
        // Assume US format MM/DD/YYYY by default unless p1 > 12
        if (p1 > 12) {
          // DD/MM/YYYY
          return new Date(y, p2 - 1, p1);
        } else {
          // MM/DD/YYYY
          return new Date(y, p1 - 1, p2);
        }
      }
    }
    return null;
  }

  // Format a Date object based on target input hints
  function formatDateForInput(date, element) {
    if (!date || isNaN(date.getTime())) return '';

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');

    // If input type is "date", browser strictly requires YYYY-MM-DD
    if (element.type === 'date') {
      return `${yyyy}-${mm}-${dd}`;
    }

    // For text inputs, inspect hints in placeholder or labels
    const attrs = getElementAttributes(element);
    const labelText = getLabelText(element);
    const hintsText = (attrs.placeholder + ' ' + labelText + ' ' + attrs.ariaLabel).toLowerCase();

    // Padded 2-digit year
    const yy = String(yyyy).slice(-2);
    let yearStr = String(yyyy);
    
    // If layout explicitly asks for 'yy' but not 'yyyy', use 2-digit year
    if ((hintsText.includes('/yy') || hintsText.includes('-yy') || hintsText.endsWith('yy') || hintsText.includes('year')) && !hintsText.includes('yyyy')) {
      yearStr = yy;
    }

    // Check for DD/MM/YYYY format
    if (hintsText.includes('dd/mm') || hintsText.includes('dd-mm') || hintsText.includes('day/month')) {
      if (hintsText.includes('-')) return `${dd}-${mm}-${yearStr}`;
      return `${dd}/${mm}/${yearStr}`;
    }

    // Check for YYYY/MM/DD format
    if (hintsText.includes('yyyy/mm') || hintsText.includes('yyyy-mm') || hintsText.includes('year/month') || hintsText.includes('yy/mm') || hintsText.includes('yy-mm')) {
      if (hintsText.includes('-')) return `${yearStr}-${mm}-${dd}`;
      return `${yearStr}/${mm}/${dd}`;
    }

    // Default to US format MM/DD/YYYY for text inputs
    if (hintsText.includes('-')) return `${mm}-${dd}-${yearStr}`;
    return `${mm}/${dd}/${yearStr}`;
  }

  // Get the expected value for a field key
  function getExpectedValue(element, key) {
    let value = personalInfoMap[key];
    if (value === undefined || value === null) return '';
    if (key === 'dob') {
      const dateObj = parseDate(value);
      if (dateObj) {
        value = formatDateForInput(dateObj, element);
      }
    }
    return value;
  }

  // Check if a field is correctly filled with the expected value
  function isCorrectlyFilled(element, expectedValue) {
    if (!element || expectedValue === undefined || expectedValue === null) return false;

    try {
      // Handle select elements
      if (element.tagName === 'SELECT') {
        const options = Array.from(element.options);
        const valLower = expectedValue.toLowerCase().trim();

        // Pass 1: Exact match on value or text
        let match = options.find(opt =>
          opt.value.toLowerCase().trim() === valLower ||
          opt.text.toLowerCase().trim() === valLower
        );

        // Pass 2: Fuzzy matches for specific fields
        if (!match) {
          const labelText = getLabelText(element);
          const nameOrId = (element.id + ' ' + element.name).toLowerCase();
          const attrs = getElementAttributes(element);
          const contextText = (nameOrId + ' ' + labelText + ' ' + attrs.autocomplete + ' ' + attrs.className + ' ' + attrs.placeholder).toLowerCase();

          // 2a. Country mapping
          if (contextText.includes('country') || contextText.includes('nation')) {
            const countryMap = {
              'india': 'in', 'in': 'india', 'ind': 'india',
              'united states': 'us', 'us': 'united states', 'usa': 'united states',
              'united kingdom': 'uk', 'uk': 'united kingdom', 'gb': 'united kingdom', 'great britain': 'united kingdom', 'gbr': 'united kingdom',
              'canada': 'ca', 'ca': 'canada', 'can': 'canada',
              'australia': 'au', 'au': 'australia', 'aus': 'australia'
            };
            const mappedVal = countryMap[valLower];
            if (mappedVal) {
              match = options.find(opt =>
                opt.value.toLowerCase().trim() === mappedVal ||
                opt.text.toLowerCase().trim() === mappedVal
              );
            }
          }

          // 2b. Gender mapping
          if (!match && (contextText.includes('gender') || contextText.includes('sex'))) {
            const genderMap = {
              'male': 'm', 'm': 'male',
              'female': 'f', 'f': 'female',
              'other': 'o', 'o': 'other'
            };
            const mappedVal = genderMap[valLower];
            if (mappedVal) {
              match = options.find(opt =>
                opt.value.toLowerCase().trim() === mappedVal ||
                opt.text.toLowerCase().trim() === mappedVal
              );
            }
          }

          // 2c. Month mapping
          if (!match && contextText.includes('month')) {
            const monthIndex = parseInt(expectedValue, 10);
            if (!isNaN(monthIndex) && monthIndex >= 1 && monthIndex <= 12) {
              const monthNames = [
                ['january', 'jan', '01', '1'],
                ['february', 'feb', '02', '2'],
                ['march', 'mar', '03', '3'],
                ['april', 'apr', '04', '4'],
                ['may', '05', '5'],
                ['june', 'jun', '06', '6'],
                ['july', 'jul', '07', '7'],
                ['august', 'aug', '08', '8'],
                ['september', 'sep', '09', '9'],
                ['october', 'oct', '10'],
                ['november', 'nov', '11'],
                ['december', 'dec', '12']
              ];
              const allowed = monthNames[monthIndex - 1];
              match = options.find(opt => {
                const optVal = opt.value.toLowerCase().trim();
                const optText = opt.text.toLowerCase().trim();
                return allowed.includes(optVal) || allowed.includes(optText);
              });
            }
          }

          // 2d. Day mapping
          if (!match && (contextText.includes('day') || contextText.includes('date'))) {
            const dayVal = parseInt(expectedValue, 10);
            if (!isNaN(dayVal) && dayVal >= 1 && dayVal <= 31) {
              match = options.find(opt => {
                const optVal = parseInt(opt.value, 10);
                const optText = parseInt(opt.text, 10);
                return optVal === dayVal || optText === dayVal;
              });
            }
          }

          // 2e. Year mapping
          if (!match && contextText.includes('year')) {
            const yearVal = parseInt(expectedValue, 10);
            if (!isNaN(yearVal)) {
              match = options.find(opt => {
                const optVal = parseInt(opt.value, 10);
                const optText = parseInt(opt.text, 10);
                return optVal === yearVal || optText === yearVal ||
                       (optVal === yearVal % 100) || (optText === yearVal % 100);
              });
            }
          }
        }

        // Pass 3: Substring matching (case-insensitive)
        if (!match) {
          match = options.find(opt => {
            const optVal = opt.value.toLowerCase().trim();
            const optText = opt.text.toLowerCase().trim();
            if (valLower.length > 2) {
              return optVal.includes(valLower) || valLower.includes(optVal) ||
                     optText.includes(valLower) || valLower.includes(optText);
            } else {
              return optVal === valLower || optText === valLower;
            }
          });
        }

        if (match) {
          return element.value === match.value;
        }
        return false;
      }

      // Handle radio buttons
      if (element.type === 'radio') {
        const valLower = expectedValue.toLowerCase().trim();
        const elValLower = element.value.toLowerCase().trim();
        
        let isMatch = elValLower === valLower;
        
        if (!isMatch) {
          const labelText = getLabelText(element);
          if (labelText) {
            isMatch = labelText.toLowerCase().trim() === valLower;
          }
        }
        
        // Fuzzy matches for gender radio buttons
        if (!isMatch && (element.name.toLowerCase().includes('gender') || element.name.toLowerCase().includes('sex') || element.id.toLowerCase().includes('gender') || element.id.toLowerCase().includes('sex'))) {
          const genderMap = {
            'male': ['m', 'male'],
            'female': ['f', 'female'],
            'other': ['o', 'other']
          };
          const allowed = genderMap[valLower];
          if (allowed) {
            isMatch = allowed.includes(elValLower) || allowed.includes(getLabelText(element).toLowerCase().trim());
          }
        }

        if (isMatch) {
          return element.checked;
        } else {
          return false;
        }
      }

      // Normal input/textarea
      const curVal = element.value || '';
      return curVal.trim().toLowerCase() === expectedValue.toLowerCase().trim();
    } catch (e) {
      return false;
    }
  }

  // Main fill function — 3-pass approach
  async function fillForms(mode, settings) {
    const fields = getFillableFields();
    const results = [];
    const usedKeys = new Set();
    const filledElements = new WeakSet();

    // Helper to fill a single field
    function doFill(element, key, matchType) {
      let value = personalInfoMap[key];
      if (!value || usedKeys.has(key)) return false;

      // Special handling for Date of Birth formatting
      if (key === 'dob') {
        const dateObj = parseDate(value);
        if (dateObj) {
          value = formatDateForInput(dateObj, element);
        }
      }

      const label = getFieldLabel(element);
      const success = setFieldValue(element, value);

      if (success) {
        usedKeys.add(key);
        filledElements.add(element);
        highlightField(element, settings.highlightFilled);

        let status = 'filled';
        if (matchType === 'keyword' || matchType === 'partial') {
          status = 'guessed';  // best guess, user should review
        } else if (matchType === 'type') {
          status = 'weak-guess';  // very weak signal
        }

        results.push({
          status: status,
          label: label,
          key: key,
          matchType: matchType,
          fieldId: element.id || element.name || ''
        });
        return true;
      }
      return false;
    }

    // ===== PASS 1: Exact matches (score >= 3) =====
    const exactMatches = [];
    for (const field of fields) {
      if (settings.skipDisabled && field.disabled) continue;
      if (settings.skipReadonly && field.readOnly) {
        const match = findBestMatch(field, mode);
        const isPicker = match && (match.key === 'dob' || match.key === 'dobDay' || match.key === 'dobMonth' || match.key === 'dobYear' || match.key === 'country' || match.key === 'gender');
        if (!isPicker) continue;
      }

      const match = findBestMatch(field, mode);
      if (match) {
        exactMatches.push({
          element: field,
          key: match.key,
          score: match.score,
          matchType: 'exact'
        });
      }
    }

    // Sort by score descending (best matches first)
    exactMatches.sort((a, b) => b.score - a.score);

    for (const item of exactMatches) {
      const expectedVal = getExpectedValue(item.element, item.key);
      if (isCorrectlyFilled(item.element, expectedVal)) {
        filledElements.add(item.element);
        usedKeys.add(item.key);
        // Add to results as filled
        const label = getFieldLabel(item.element);
        results.push({
          status: 'filled',
          label: label,
          key: item.key,
          matchType: 'exact',
          fieldId: item.element.id || item.element.name || ''
        });
        continue; // skip setting value again
      }

      doFill(item.element, item.key, 'exact');
      if (settings.animationDelay > 0) {
        await new Promise(r => setTimeout(r, settings.animationDelay));
      }
    }

    // ===== PASS 2: Fuzzy fallback for remaining unfilled fields =====
    if (settings.fuzzyFallback !== false) {  // on by default
      for (const field of fields) {
        if (settings.skipDisabled && field.disabled) continue;
        if (settings.skipReadonly && field.readOnly) {
          const guess = fuzzyMatch(field);
          const isPicker = guess && (guess.key === 'dob' || guess.key === 'dobDay' || guess.key === 'dobMonth' || guess.key === 'dobYear' || guess.key === 'country' || guess.key === 'gender');
          if (!isPicker) continue;
        }
        if (filledElements.has(field)) continue;  // already filled in pass 1

        const guess = fuzzyMatch(field);
        if (guess) {
          const expectedVal = getExpectedValue(field, guess.key);
          if (isCorrectlyFilled(field, expectedVal)) {
            filledElements.add(field);
            usedKeys.add(guess.key);
            // Add to results
            const label = getFieldLabel(field);
            results.push({
              status: guess.matchType === 'type' ? 'weak-guess' : 'guessed',
              label: label,
              key: guess.key,
              matchType: guess.matchType,
              fieldId: field.id || field.name || ''
            });
            continue;
          }

          doFill(field, guess.key, guess.matchType);
          if (settings.animationDelay > 0) {
            await new Promise(r => setTimeout(r, settings.animationDelay));
          }
        } else if (field.value && field.value.trim() !== '') {
          // If it has a value but no match/guess, skip it
          continue;
        }
      }
    }

    // ===== PASS 3: Report unfilled fields =====
    for (const field of fields) {
      if (settings.skipDisabled && field.disabled) continue;
      if (settings.skipReadonly && field.readOnly) {
        const match = findBestMatch(field, mode) || fuzzyMatch(field);
        const isPicker = match && (match.key === 'dob' || match.key === 'dobDay' || match.key === 'dobMonth' || match.key === 'dobYear' || match.key === 'country' || match.key === 'gender');
        if (!isPicker) continue;
      }
      if (filledElements.has(field)) continue;
      
      if (field.value && field.value.trim() !== '') {
        const match = findBestMatch(field, mode) || fuzzyMatch(field);
        if (match) {
          const expectedVal = getExpectedValue(field, match.key);
          if (isCorrectlyFilled(field, expectedVal)) {
            continue; // Correctly filled, skip reporting
          }
        } else {
          continue; // Has a value but no match/guess, skip reporting
        }
      }

      // This field was not filled at all (or is filled incorrectly)
      const label = getFieldLabel(field);
      results.push({
        status: 'unfilled',
        label: label,
        key: null,
        matchType: 'none',
        fieldId: field.id || field.name || ''
      });
    }

    return results;
  }

  function getFieldLabel(element) {
    const attrs = getElementAttributes(element);
    if (attrs.name) return attrs.name;
    if (attrs.id) return attrs.id;
    if (element.type) return element.type;
    return 'unknown';
  }

  // Initialize and listen for messages from popup
  function init() {
    loadPersonalInfo();

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'fillForms') {
        // Make sure personal info is loaded before filling
        (async () => {
          // Wait for loadPersonalInfo to complete (it runs at init)
          let retries = 0;
          while (!personalInfoLoaded && retries < 50) {
            await new Promise(r => setTimeout(r, 50));
            retries++;
          }
          
          const dataKeys = Object.keys(personalInfoMap);
          if (dataKeys.length === 0) {
            console.log('[Fill Anything] No personal info configured');
            sendResponse({ results: [], personalInfoEmpty: true });
            return;
          }
          console.log('[Fill Anything] Filling with', dataKeys.length, 'data keys');
          
          try {
            const results = await fillForms(message.mode || 'all', message.settings || {});
            console.log('[Fill Anything] Fill complete:', results.length, 'results');
            sendResponse({ results: results });
          } catch (err) {
            console.error('[Fill Anything] Fill error:', err);
            sendResponse({ results: [{ status: 'error', label: err.message }] });
          }
        })();
        return true; // Async response
      }

      if (message.action === 'clearFilled') {
        clearHighlights();
        // Also clear values of highlighted fields
        document.querySelectorAll('.' + HIGHLIGHT_CLASS).forEach(el => {
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else if (el.tagName === 'SELECT') {
            el.selectedIndex = 0;
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        sendResponse({ success: true });
        return false;
      }

      if (message.action === 'scanForms') {
        const fields = getFillableFields();
        sendResponse({ count: fields.length, hasFields: fields.length > 0 });
        return false;
      }

      if (message.action === 'reloadData') {
        loadPersonalInfo().then(() => {
          sendResponse({ success: true });
        });
        return true;
      }
    });

    // Re-load personal info when storage changes
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (changes[STORAGE_KEY]) {
          buildMap(changes[STORAGE_KEY].newValue || {});
        }
      });
    }
  }

  init();

  // Expose API for testing (Playwright / CDP access)
  window.__fillAnything = {
    getFillableFields,
    findBestMatch,
    fillForms,
    clearHighlights,
    setFieldValue,
    scoreMatch,
    fuzzyMatch,
    getLabelText,
    getElementAttributes,
    getFieldLabel,
    loadPersonalInfo,
    buildMap,
    reloadData: () => loadPersonalInfo(),
    get personalInfoMap() { return personalInfoMap; },
    set personalInfoMap(v) { personalInfoMap = v; },
    setPersonalInfoMap(v) { personalInfoMap = v; },
  };
})();
