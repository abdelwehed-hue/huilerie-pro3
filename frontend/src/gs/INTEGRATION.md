# Intégration frontend GS

1. Dans `frontend/src/App.tsx`, ajouter une route isolée:

```tsx
import { GSApp } from "@/gs/GSApp";

// inside <Routes>:
<Route path="/gs/*" element={<GSApp />} />
```

2. Depuis le menu admin original, un seul lien « Gestion Commerciale (GS) » vers `/gs`.

3. Le shell GS remplace la navigation originale sous `/gs/*`.
   Le bouton « Quitter GS » revient à `/`.
