import type { StrapiApp } from '@strapi/strapi/admin';

import AuthLogo from './extensions/colaberry-ai-logo.svg';
import MenuLogo from './extensions/colaberry-icon.svg';

export default {
  config: {
    // --- Colaberry logo branding ---
    auth: {
      logo: AuthLogo,
    },
    menu: {
      logo: MenuLogo,
    },

    // --- Theme: Colaberry coral accent colors ---
    theme: {
      light: {
        colors: {
          primary100: '#FEF2F2',
          primary200: '#FECACA',
          primary500: '#EF4444',
          primary600: '#DC2626',
          primary700: '#B91C1C',
          buttonPrimary500: '#EF4444',
          buttonPrimary600: '#DC2626',
        },
      },
      dark: {
        colors: {
          primary100: '#1C1917',
          primary200: '#44403C',
          primary500: '#F87171',
          primary600: '#F87171',
          primary700: '#FCA5A5',
          buttonPrimary500: '#F87171',
          buttonPrimary600: '#EF4444',
        },
      },
    },

    // --- Disable non-production elements ---
    tutorials: false,
    notifications: {
      releases: false,
    },

    // --- English only ---
    locales: [],
  },

  bootstrap(app: StrapiApp) {
    // No custom bootstrap logic needed
  },
};
