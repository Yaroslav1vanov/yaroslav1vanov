import './globals.css';

export const metadata = {
  title: 'EasyLife AI — CRM',
  description: 'CRM-система для управления клиентами и контентом',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;700;800;900&family=DM+Sans:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
