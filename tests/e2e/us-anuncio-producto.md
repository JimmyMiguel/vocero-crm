# US — Del anuncio al producto (spec 022)

Arnés: `pnpm test:e2e:anuncios` con la app viva y los mocks encendidos.

1. Producto con el ID del anuncio pegado → quien escribe desde ese anuncio
   recibe la foto de ESE producto sin que le pregunten cuál.
2. El cliente pide la foto otra vez → la vuelve a recibir.
3. Anuncio de un producto con stock 0 → le dicen que ya se vendió, sin foto.
4. Anuncio sin ID pegado cuyo titular nombra un producto → recibe su foto y el
   anuncio queda conectado a ese producto; `/api/catalog/ads` lo lista.
5. Anuncio genérico → le preguntan qué producto le interesa y no se conecta.
6. Pegar un ID en otro producto lo quita del anterior.
7. Un ID con forma rara → 422 con mensaje claro.
