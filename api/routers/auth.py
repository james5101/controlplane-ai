from fastapi import APIRouter

router = APIRouter()


@router.get("/github")
async def github_oauth():
    """Initiate GitHub OAuth flow."""
    # TODO: redirect to GitHub OAuth
    pass


@router.get("/github/callback")
async def github_callback(code: str):
    """Handle GitHub OAuth callback, exchange code for token."""
    # TODO: exchange code, create session, return JWT
    pass
