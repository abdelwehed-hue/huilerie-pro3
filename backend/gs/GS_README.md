# Gestion Commerciale (GS) — Oro Verde

**Nouveau système isolé.** Ne réutilise pas `backend/commercial` ni ses collections.

## Isolation

- Base MongoDB dédiée: `oroverde_gs` (`GS_MONGO_URL`, `GS_DB_NAME`)
- Namespace backend: `backend/gs/`
- API prefix: `/api/gs/*`
- Permissions: collection `gs_users_permissions`
- Identité: session Oro Verde existante (lecture seule)

## Variables d'environnement

```
GS_MONGO_URL=mongodb://...   # indépendant
GS_DB_NAME=oroverde_gs
```

Si `GS_MONGO_URL` est absent, le module GS échoue clairement (pas de fallback).

## Codes

| Type | Format | Exemple |
|------|--------|--------|
| Matériau (permanent) | SEASON + A + SEQ | 2627A0008 |
| Facture | SEASON + F + SEQ | 2627F0001 |

Le code matériau est généré **une seule fois** à l'achat et suit toutes les étapes.

## Modules livrés (fondation)

- Health `/api/gs/health`
- Customers, Suppliers
- Purchases (+ création matériau + événement traçabilité)
- Materials + historique
- Tanks (CRUD + transfert FIFO avec allocations)

## Modules suivants (à continuer)

Réception, Préparation, Qualité, Production, Ventes, Factures, Paiements, Retours, Rapports, Utilisateurs UI, Frontend shell complet.

## Montage

Dans `server.py` (changement minimal):

```python
from gs.app import router as gs_router
api_router.include_router(gs_router)
# lifespan: ensure_gs_indexes + close_gs_client
```
