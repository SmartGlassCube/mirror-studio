import type { WidgetProps } from '../defineWidget'

type Game = { id: string; title?: string; icon?: string }
type GamesData = { games?: Game[] }

const GamesWidget = ({ widget }: WidgetProps<GamesData>) => {
  const games = widget.data?.games ?? []

  return (
    <div className="widget games-widget">
      <h2>Games</h2>
      {widget.content ? <div>{widget.content}</div> : null}
      {games.length === 0 ? <div>No games yet</div> : null}
      <div className="games-grid">
        {games.map((game) => (
          <div key={game.id} className="game-tile">
            <div className="game-tile__icon">
              {game.icon ? <img src={game.icon} alt="" /> : '?'}
            </div>
            <div className="game-tile__title">{game.title ?? game.id}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default GamesWidget
