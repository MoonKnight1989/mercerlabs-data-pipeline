const API_KEY = process.env['VIVENU_API_KEY']!;

async function main() {
  // Test different param formats for the scans endpoint
  const urls = [
    'https://portier.vivenu.com/api/scans?top=5&start=2026-01-01T00:00:00.000Z&end=2026-01-08T00:00:00.000Z',
    'https://portier.vivenu.com/api/scans?top=5',
    'https://portier.vivenu.com/api/scans?top=5&skip=0',
  ];

  for (const url of urls) {
    console.log(`\nTrying: ${url}`);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    console.log(`Status: ${res.status}`);
    if (!res.ok) {
      console.log('Body:', await res.text());
    } else {
      const d = await res.json();
      console.log(`Total: ${d.total}, Docs: ${(d.docs ?? []).length}`);
      if (d.docs?.[0]) {
        console.log('Sample keys:', Object.keys(d.docs[0]).join(', '));
      }
    }
  }
}

main();
