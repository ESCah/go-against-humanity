if (!window.WebSocket) {
    alert("Your browser does not support WebSockets!")
}

// TODO: uncomment
// const IS_PLAYER = !!window.IS_PLAYER;
const IS_PLAYER = 1;

class Card extends React.Component {
    render() {
        // https://stackoverflow.com/a/6040258
        // https://stackoverflow.com/a/8541575
        const baseHeight = 20.25; // in rems
        let style = {
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: "0%",
            backgroundColor: "#a9f16c",
            zIndex: -1,
        };
        if (this.props.total) {
            const percentage = this.props.total / this.props.sum;
            style.height = percentage * 100 + "%";
        };
        let classes = "card ";
        classes += "card-" + (this.props.black ? "black" : "white") + " ";
        if (this.props.text.length > 40)
            classes += "small-text";
        return <div className={classes} onClick={this.props.onClick}>
            <div className="card-top">
                <div className="card-content">
                    {this.props.text}
                </div>
            </div>
            <div className="card-middle">
                {this.props.total || ""}
            </div>
            <div className="card-bottom">
                Cards Against Humanity
            </div>
            <div style={{position: "absolute", top: 0, left: 0, bottom: 0,right: 0}}>
                <div style={style} className="vote-bg"></div>
            </div>
        </div>
    }
}

class BlackRow extends React.PureComponent {
    render() {
        return <div className="flex" id="blackrow">
            {("card" in this.props) ?
                this.props.card :
                <i>In attesa di una nuova carta nera...</i>
            }
        </div>;
    }
}

class AnswersRow extends React.Component {
    render() {
        /* Expects:
           * a prop "answers", containing an array of {text, ID};
           * a prop "totals", containing an array of {Votes}.
         */
        let sum = 0;
        if (this.props.totals) {
            sum = this.props.totals.reduce((a, b) => a + b.Votes, 0);
        }
        return <div className="flex" id="blackrow">
            {
                this.props.answers.map((answer, i) => <Card text={answer.text} id={answer.ID} total={answer.total} sum={sum} key={i} />)
            }
        </div>;
    }
}

class MyCardsRow extends React.Component {
    submitCard(id) {
        if (!canPickCard) {
            alert("You cannot pick a card at this time!");
            return;
        }
        const req = new XMLHttpRequest();
        req.open("PUT", `/match/${MATCH_ID}/pick_card/${id}`);
        req.send();
    }
    render() {
        /* Expects:
           * a prop "cards", containing an array of {text, ID};
         */
        return <>
            {
                this.props.cards.map((answer, i) => <Card text={answer.text} id={answer.ID} onClick={() => this.submitCard(answer.ID)} key={i} />)
            }
        </>;
    }
}

const blackrowDiv = document.getElementById("react-blackrow");
ReactDOM.render(<BlackRow />, blackrowDiv);
const whiterowDiv = document.getElementById("react-whiterow");
ReactDOM.render(<AnswersRow answers={[]} />, whiterowDiv);
const mycardsDiv = document.getElementById("react-mycards");
if (IS_PLAYER) {
    mycardsDiv.style.display = "flex";
}

const whiteRow = document.getElementById("whiterow");
// TODO: cambiare URL e numero match
const socket = new WebSocket(`ws://${document.location.hostname}:8080/ws?match=${MATCH_ID}`);
socket.onopen = function() {
    console.log("Opened socket.");
};

function getCardText(data) {
    const {NewCard: { text: cardText }} = data
    return cardText
}

function getCardTotals(data) {
    const { Totals: _totals } = data
    return _totals
}

let answers = [];
let totals = [];
let canPickCard = false;
let timer = document.getElementsByClassName("match-timer")[0];
let timer_interval;
let seconds_left;
socket.onmessage = function (e) {
    console.log("Received", e.data);
    const data = JSON.parse(e.data);
    const { Name: eventName } = data 
    let cardText;
    switch (eventName) {
    case "join_successful":
        answers = [];
        ReactDOM.render(<BlackRow />, blackrowDiv);
        ReactDOM.render(<AnswersRow answers={[]}/>, whiterowDiv);
        if (IS_PLAYER) {
            const req = new XMLHttpRequest();
            req.addEventListener("load", () => {
                console.log(req.responseText);
                const resp = JSON.parse(req.responseText);
                const cards = resp.map(item => ({text: item.text, ID: item.Id}));
                console.log("My cards:", cards);
                ReactDOM.render(<MyCardsRow cards={cards} />, mycardsDiv);
            });
            req.open("GET", `/mycards?match_id=${MATCH_ID}`);
            req.send();
        }
        break;
    case "new_black":
        canPickCard = true;
        seconds_left = data.Duration;
        timer_interval = setInterval(() => {
            const minutes = Math.floor(seconds_left / 60);
            const seconds = seconds_left % 60;
            timer.textContent = minutes + ":" + seconds;
            seconds_left--;
        }, 1000);
        setTimeout(stopTimer, data.Duration * 1000);
        ReactDOM.render(<BlackRow card={<Card text={data.NewCard.text} black />}/>, blackrowDiv);
        break;
    case "new_white":
        cardText = getCardText(data)
        answers.push({ text: data.NewCard.text, total: 0, ID: data.NewCard.Id });
        ReactDOM.render(<AnswersRow answers={answers}/>, whiterowDiv);
        break;
    case "totals":
        totals = data.Totals
        for (const total of totals) {
            answers.find(a => a.ID == total.ID).total = total.Votes;
        }
        ReactDOM.render(<AnswersRow answers={answers} totals={totals}/>, whiterowDiv);
        break;
    case "voting":
        stopTimer();
        break;
    default:
        alert("Unknown event " + eventName);
    }
}
socket.onclose = function () {
    console.log("Socket closed.");
}

let bcb = document.getElementsByClassName("admin-panel-new-blackcard")[0];
bcb.addEventListener("click", ()=>{
    const req = new XMLHttpRequest();
    req.open("PUT", `/admin/match/${MATCH_ID}/new_black_card`);
    req.send();
});

function stopTimer() {
    clearInterval(timer_interval);
    timer.textContent = "";
    timer.style.display = "none";
    canPickCard = false;
}