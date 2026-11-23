
import strawberry


@strawberry.type
class Query:

    @strawberry.field
    async def hello(self) -> str:
        return "Welcome to HookReplay!"


schema = strawberry.Schema(query=Query)
