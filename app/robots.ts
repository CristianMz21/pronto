import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/dashboard',
          '/pos',
          '/caja',
          '/crm',
          '/inventory',
          '/booking',
          '/settings',
          '/client',
          '/api',
        ],
      },
    ],
    sitemap: 'https://trypronto.app/sitemap.xml',
  }
}
