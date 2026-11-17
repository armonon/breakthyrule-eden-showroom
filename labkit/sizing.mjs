// Published Shaka Wear measurements, checked against the supplier on 2026-11-17.
// The seven Ghost Studio references are supplier charts, not dimensions inferred from 3D models.
import { SIZES } from './catalog.mjs';
export const SHAKA_SIZES = Object.freeze(['S', 'M', 'L', 'XL', 'XXL']);
export const SHAKA_CHARTS = [
  {
    "id": "cropped-crewneck",
    "title": "Cropped Crewneck",
    "source": "https://www.shakawear.com/products/cropped-crewneck",
    "unit": "in",
    "sizes": [
      "S",
      "M",
      "L",
      "XL",
      "XXL"
    ],
    "rows": [
      {
        "label": "Chest",
        "values": [
          "25",
          "26.5",
          "28",
          "29.5",
          "31"
        ]
      },
      {
        "label": "Length",
        "values": [
          "24",
          "24.5",
          "25",
          "25.5",
          "26.5"
        ]
      },
      {
        "label": "Sleeve",
        "values": [
          "20",
          "21",
          "21.5",
          "21.5",
          "22"
        ]
      }
    ],
    "note": ""
  },
  {
    "id": "hooded-fleece-bomber",
    "title": "Hooded Fleece Bomber",
    "source": "https://www.shakawear.com/products/hooded-fleece-bomber",
    "unit": "in",
    "sizes": [
      "S",
      "M",
      "L",
      "XL",
      "XXL"
    ],
    "rows": [
      {
        "label": "Chest",
        "values": [
          "25.5",
          "26.5",
          "27.5",
          "28.5",
          "29.5"
        ]
      },
      {
        "label": "Length",
        "values": [
          "25.75",
          "26.375",
          "27.5",
          "27.875",
          "29.25"
        ]
      }
    ],
    "note": ""
  },
  {
    "id": "garment-dye-double-layer-reversible-hoodie",
    "title": "Garment Dye Double Layer Reversible Hoodie",
    "source": "https://www.shakawear.com/products/garment-dye-double-layer-reversible-hoodie",
    "unit": "in",
    "sizes": [
      "S",
      "M",
      "L",
      "XL",
      "XXL"
    ],
    "rows": [
      {
        "label": "Chest",
        "values": [
          "24",
          "26",
          "28",
          "30",
          "32"
        ]
      },
      {
        "label": "Length",
        "values": [
          "28.5",
          "29.5",
          "31.5",
          "31.5",
          "32.5"
        ]
      },
      {
        "label": "Sleeve",
        "values": [
          "24.5",
          "25",
          "25.5",
          "26",
          "26.5"
        ]
      }
    ],
    "note": ""
  },
  {
    "id": "los-angeles-13-5oz-heavyweight-garment-dye-baggy-sweatpants",
    "title": "Los Angeles 13.5oz Heavyweight Garment Dye Baggy Sweatpants",
    "source": "https://www.shakawear.com/products/los-angeles-13-5oz-heavyweight-garment-dye-baggy-sweatpants",
    "unit": "in",
    "sizes": [
      "S",
      "M",
      "L",
      "XL",
      "XXL"
    ],
    "rows": [
      {
        "label": "Waist",
        "values": [
          "14",
          "15",
          "16",
          "17",
          "18"
        ]
      },
      {
        "label": "Leg Opening",
        "values": [
          "8.5",
          "9",
          "9.5",
          "10",
          "10.5"
        ]
      }
    ],
    "note": "Shaka’s published length label and measuring instructions disagree, so that measurement is omitted here. Check the supplier page for details."
  },
  {
    "id": "9-0oz-heavyweight-thermal-2-0",
    "title": "9.0oz Heavyweight Thermal 2.0",
    "source": "https://www.shakawear.com/products/9-0oz-heavyweight-thermal-2-0",
    "unit": "in",
    "sizes": [
      "S",
      "M",
      "L",
      "XL",
      "XXL"
    ],
    "rows": [
      {
        "label": "Chest",
        "values": [
          "20",
          "22",
          "24",
          "26",
          "28"
        ]
      },
      {
        "label": "Length",
        "values": [
          "27",
          "28",
          "29",
          "31",
          "34"
        ]
      }
    ],
    "note": ""
  },
  {
    "id": "7-5-oz-max-heavyweight-garment-dye-raw-hem",
    "title": "7.5 oz Max Heavyweight Garment Dye Raw Hem Tee",
    "source": "https://www.shakawear.com/products/7-5-oz-max-heavyweight-garment-dye-raw-hem",
    "unit": "in",
    "sizes": [
      "S",
      "M",
      "L",
      "XL",
      "XXL"
    ],
    "rows": [
      {
        "label": "Chest",
        "values": [
          "18.75",
          "20.75",
          "22.75",
          "24.75",
          "26.5"
        ]
      },
      {
        "label": "Length",
        "values": [
          "24",
          "25",
          "26",
          "26.5",
          "27"
        ]
      }
    ],
    "note": ""
  },
  {
    "id": "9-0oz-heavyweight-thermal",
    "title": "9.0oz Heavyweight Thermal",
    "source": "https://www.shakawear.com/products/9-0oz-heavyweight-thermal",
    "unit": "in",
    "sizes": [
      "S",
      "M",
      "L",
      "XL",
      "XXL"
    ],
    "rows": [
      {
        "label": "Chest",
        "values": [
          "18",
          "20",
          "22",
          "24",
          "26"
        ]
      },
      {
        "label": "Length",
        "values": [
          "29",
          "30",
          "31",
          "33",
          "35"
        ]
      },
      {
        "label": "Sleeve",
        "values": [
          "28",
          "30",
          "31.25",
          "32.25",
          "34.5"
        ]
      }
    ],
    "note": ""
  },
  {
    "id": "garment-dye-fleece-mens-shorts",
    "title": "Garment Dye Fleece Mens Shorts",
    "source": "https://www.shakawear.com/products/garment-dye-fleece-mens-shorts",
    "unit": "in",
    "sizes": [
      "S",
      "M",
      "L",
      "XL",
      "XXL"
    ],
    "rows": [
      {
        "label": "Waist",
        "values": [
          "14",
          "15",
          "16",
          "17",
          "18"
        ]
      },
      {
        "label": "Outseam",
        "values": [
          "18.75",
          "19.75",
          "19.75",
          "20.75",
          "21.75"
        ]
      }
    ],
    "note": "Additional Shaka reference for sweat shorts; this style was not included in the Ghost Studio garment list."
  }
];
export const GARMENT_CHART_IDS = {
  tee: ['7-5-oz-max-heavyweight-garment-dye-raw-hem'],
  hoodie: ['garment-dye-double-layer-reversible-hoodie', 'hooded-fleece-bomber'],
  crewneck: ['cropped-crewneck'],
  sweatpants: ['los-angeles-13-5oz-heavyweight-garment-dye-baggy-sweatpants'],
  longsleeve: ['9-0oz-heavyweight-thermal', '9-0oz-heavyweight-thermal-2-0'],
  shorts: ['garment-dye-fleece-mens-shorts']
};
export function garmentSizes(item = {}) {
  return item.construction === 'cut-sew' ? [...SIZES] : [...SHAKA_SIZES];
}
export function garmentSizeGuide(item = {}) {
  if (item.construction === 'cut-sew') return { href: null, label: '', note: 'No Cut & Sew size chart is published yet.' };
  return {
    href: '/size-guide#' + (Object.hasOwn(GARMENT_CHART_IDS, item.garment) ? item.garment : 'shaka'),
    label: 'Shaka Wear size guide',
    note: (item.labMode === 'random' ? 'The studio selects the Shaka base and color. ' : '') + 'Measurements vary by Shaka style. Compare the named supplier charts; XXL is Shaka’s 2XL.'
  };
}
