import React, { PureComponent, Component } from "react"
import ReactDOM from "react-dom"
import Navbar from "./navbar"
import PlayersList from "./playerslist"
import Card from "./card"

if (!window.WebSocket) {
	alert("Il tuo browser non supporta i WebSocket!")
}

class MyCardsRow extends Component {
	constructor(props) {
		super(props);
		this.state = {
			selectedCard: null
		};
	}

	submitCard(id) {
		if (!this.props.canPickCard) {
			// alert("You cannot pick a card at this time!");
			return false;
		}
		const req = new XMLHttpRequest();
		req.open("PUT", `/matches/${MATCH_ID}/pick_card/${id}`);
		req.send();
		return true;
	}

	render() {
		const cards = this.props.cards.map(answer => <Card
			text={answer.text}
			id={answer.ID}
			selected={answer.ID == this.state.selectedCard}
			onClick={() => {
				const success = this.submitCard(answer.ID);
				if (!success)
					return;
				this.setState(Object.assign(this.state, {
					selectedCard: answer.ID,
				}));
				this.props.setCanPickCard(false);
			}}
			key={answer.ID} />
		);
		return <div id="react-mycards">
			{cards}
		</div>
	}
}

class AnswersRow extends Component {
	constructor(props) {
		super(props);
		this.state = {
			votedCard: null
		};
	}

	tryVote(id) {
		if (IS_PLAYER) {
			// alert("You're a player, you cannot vote!");
			console.log("Not a player, can't vote");
			return;
		}
		if (!this.props.canVote) {
			console.log("this.state.canVote is false");
			return;
		}
		const req = new XMLHttpRequest();
		req.open("PUT", `/matches/${MATCH_ID}/vote_card/${id}`);
		req.send();
		// window.canVote = false;
		return true;
	}

	render() {
		// Expects:
		// * a prop "answers", containing an array of {text, ID};
		// * a prop "totals", containing an array of {Votes}.
		let sum = 0;
		if (this.props.totals) {
			sum = this.props.totals.reduce((a, b) => a + b.Votes, 0);
		}

		const cards = this.props.answers.map(answer => <Card
			voted={answer.ID === this.state.votedCard}
			text={answer.text}
			id={answer.ID}
			total={answer.total}
			sum={sum}
			onClick={() => {
				const success = this.tryVote(answer.ID);
				if (!success) return;
				this.setState({ votedCard: answer.ID });
			}}
			key={answer.ID} />);

		return <div className="flex" id="blackrow">
			{cards}
		</div>;
	}
}

class Game extends Component {
	constructor(props) {
		super(props);
		this.socket = new WebSocket(`${(document.location.protocol == "https:") ? "wss" : "ws"}://${document.location.hostname}:${document.location.port}/ws?match=${MATCH_ID}`);
		this.state = {
			isProjector: false,
			
			canPickCard: false,
			canVote: false,

			// Navbar state
			uiStateText: "Connessione in corso...",
			// Game UI state
			blackCard: null,
			myCards: [],
			answers: [],
			totals: [],

			players: [],
			jury: [],
		};
		this.socket.onopen = () => {
			this.setState(Object.assign(this.state, { uiStateText: "In attesa di una carta nera..." }));
		};
		this.socket.onmessage = e => {
			const data = JSON.parse(e.data);
			console.log("Received", data);
			const eventName = data.Name;
			switch (eventName) {
				case "players_update":
					// If we're a projector, refresh the leaderboard
					if (!this.state.isProjector)
						break;
					this.setState(Object.assign(this.state, {
						players: data.Leaderboard,
						jury: data.Jury
					}));
					break;
				case "join_successful":
					// We joined successfully. Clear the UI.
					this.resetUI();
					if (data.InitialBlackCard.Id !== 0) {
						this.showBlackCard(data.InitialBlackCard.text);
					}
					this.setMatchState(data.State);
					break;
				case "new_black":
					// A black card was chosen. Show it.
					// mycardsDiv.style.display = "flex";
					this.resetUI();
					this.showBlackCard(data.NewCard.text);
					this.setMatchState(data.State);
					break;
				case "voting":
					// The voting phase has begun.
					this.setState(Object.assign(this.state, {
						canPickCard: false,
						canVote: true,
						uiStateText: IS_PLAYER
							? "Il pubblico sta votando..."
							: "Vota la carta migliore!",
						myCards: [],
						answers: [],
					}));
					this.setMatchState(data.State);
					break;
				case "new_white":
					// A new white card (from the voting phase) was received.
					this.setState(Object.assign(this.state, {
						answers: this.state.answers.concat({ text: data.NewCard.text, total: 0, ID: data.NewCard.Id })
					}));
					this.setMatchState(data.State);
					break;
				case "hidden_white_card":
					if (IS_PLAYER)
						break;
					this.setState(Object.assign(this.state, {
						answers: this.state.answers.concat({ text: data.Username, total: 0, ID: -1 })
					}));
					this.setMatchState(data.State);
					break;
				case "vote_cast":
					let totals = data.Totals;
					let answers = this.state.answers;
					for (const total of totals) {
						answers.find(a => a.ID === total.ID).total = total.Votes;
					}

					this.setState(Object.assign(this.state, {
						answers: answers,
						totals: totals,
					}));

					this.setMatchState(data.State);
					break;
				case "show_results":
					this.setState(Object.assign(this.state, {
						uiStateText: "", // TODO
					}));
					this.setMatchState(data.State);
					break;
				case "winner":
					if (!IS_ADMIN)
						break;
					this.setState(Object.assign(this.state, {
						answers: [{ text: data.WinnerText, ID: 0 }]
					}));
					this.setMatchState(data.State);
					break;
				default:
					alert("Evento sconosciuto: " + eventName);
			}
		};
	}

	toggleProjector() {
		this.setState(Object.assign(this.state, {
			isProjector: !this.state.isProjector
		}));
	}

	setMatchState(state) {
		/*
			const (
				MATCH_WAIT_USERS MatchState = iota
				MATCH_PLAYBALE
				MATCH_VOTING
				MATCH_SHOW_RESULTS
				MATCH_END
			)
		*/
		switch (state) {
			case 0:
				this.setState(Object.assign(this.state, {
					uiStateText: 'In attesa di altri giocatori...'
				}));
				break;
			case 1:
				this.setState(Object.assign(this.state, {
					uiStateText: IS_PLAYER ? 'Gioca la tua carta bianca!' :
						'I giocatori stanno scegliendo le carte'
				}));
				break;
			case 2:
				this.setState(Object.assign(this.state, {
					uiStateText: IS_PLAYER ? 'Il pubblico sta votando...' :
						'È il tuo turno, vota la carta migliore!'
				}));
				break;
			case 3:
				this.setState(Object.assign(this.state, {
					uiStateText: 'Risultato'
				}));
				break;
		}
	}

	showBlackCard(text) {
		this.setState(Object.assign(this.state, {
			canPickCard: true,
			blackCard: <Card text={text} black />
		}));
	}

	resetUI() {
		/* todo
		for (const tag of document.getElementsByClassName("selected")) {
			tag.classList.remove("selected")
		}
		for (const tag of document.getElementsByClassName("voted")) {
			tag.classList.remove("voted")
		}
		*/
		this.setState(Object.assign(this.state, {
			blackCard: null,
			answers: [],
			totals: [],
		}));
		if (IS_PLAYER)
			this.fetchMyCards();
	}

	fetchMyCards() {
		if (!IS_PLAYER)
			return;
		const req = new XMLHttpRequest();
		req.addEventListener("load", () => {
			const resp = JSON.parse(req.responseText);
			const cards = resp.map(item => ({ text: item.text, ID: item.Id }));
			console.log("My cards:", cards);
			this.setState(Object.assign(this.state, { myCards: cards }));
		});
		req.open("GET", `/mycards?match_id=${MATCH_ID}`);
		req.send();
	}

	setCanPickCard(val) {
		this.setState(Object.assign(this.state, {
			canPickCard: val
		}));
	}

	render() {
		return <>
			<Navbar uiStateText={this.state.uiStateText} isProjector={this.state.isProjector} toggleProjector={() => this.toggleProjector()} />
			{/* Middle row */}
			<div className="flex" id="blackrow">
				{this.state.blackCard}
				{this.state.isProjector && <PlayersList players={this.state.players} jury={this.state.jury} />}
			</div>
			<MyCardsRow cards={this.state.myCards} canPickCard={this.state.canPickCard} setCanPickCard={this.setCanPickCard.bind(this)} />
			<AnswersRow answers={this.state.answers} canVote={this.state.canVote} totals={this.state.totals} />
		</>;
	}
}

ReactDOM.render(<Game />, document.getElementById("react-game"));
