"""GS domain exceptions."""
from __future__ import annotations


class GSError(Exception):
    def __init__(self, message: str, code: str = "gs_error", status: int = 400):
        self.message = message
        self.code = code
        self.status = status
        super().__init__(message)


class GSAuthError(GSError):
    def __init__(self, message: str = "not_authenticated", code: str = "not_authenticated"):
        super().__init__(message, code=code, status=401)


class GSPermissionError(GSError):
    def __init__(self, message: str = "forbidden", code: str = "forbidden"):
        super().__init__(message, code=code, status=403)


class GSNotFoundError(GSError):
    def __init__(self, message: str = "not_found", code: str = "not_found"):
        super().__init__(message, code=code, status=404)


class GSConflictError(GSError):
    def __init__(self, message: str = "conflict", code: str = "conflict"):
        super().__init__(message, code=code, status=409)


class GSSeasonError(GSError):
    def __init__(self, message: str = "season_unavailable", code: str = "season_unavailable"):
        super().__init__(message, code=code, status=422)
