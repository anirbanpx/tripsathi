import os
from langgraph.graph import StateGraph, END
import sqlite3
from langgraph.checkpoint.sqlite import SqliteSaver
from state import TripSathiState
from nodes import (
    persona_classification,
    destination_intelligence,
    candidate_gen,
    ranker,
    plan_assembly,
    critic,
    route_after_critic,
    human_feedback,
    finalize,
    route_after_feedback,
    error_node,
)


def _error_router(normal_next: str):
    """Return a routing function that short-circuits to 'error' if current_node == 'error'."""
    def _route(state: TripSathiState) -> str:
        return "error" if state.get("current_node") == "error" else normal_next
    _route.__name__ = f"route_{normal_next}_or_error"
    return _route


def build_graph():
    builder = StateGraph(TripSathiState)

    builder.add_node("persona_classification", persona_classification)
    builder.add_node("destination_intelligence", destination_intelligence)
    builder.add_node("candidate_gen", candidate_gen)
    builder.add_node("ranker", ranker)
    builder.add_node("plan_assembly", plan_assembly)
    builder.add_node("critic", critic)
    builder.add_node("human_feedback", human_feedback)
    builder.add_node("finalize", finalize)
    builder.add_node("error", error_node)

    builder.set_entry_point("persona_classification")
    builder.add_conditional_edges("persona_classification", _error_router("destination_intelligence"), {
        "destination_intelligence": "destination_intelligence",
        "error": "error",
    })
    builder.add_conditional_edges("destination_intelligence", _error_router("candidate_gen"), {
        "candidate_gen": "candidate_gen",
        "error": "error",
    })
    builder.add_edge("candidate_gen", "ranker")
    builder.add_edge("ranker", "plan_assembly")
    builder.add_conditional_edges("plan_assembly", _error_router("critic"), {
        "critic": "critic",
        "error": "error",
    })
    builder.add_conditional_edges("critic", route_after_critic, {
        "plan_assembly": "plan_assembly",
        "human_feedback": "human_feedback",
    })
    builder.add_conditional_edges("human_feedback", route_after_feedback, {
        "plan_assembly": "plan_assembly",
        "finalize": "finalize",
        END: END,
    })
    builder.add_edge("finalize", END)
    builder.add_edge("error", END)

    db_path = os.path.join(os.path.dirname(__file__), "..", "checkpoints.db")
    conn = sqlite3.connect(db_path, check_same_thread=False)
    checkpointer = SqliteSaver(conn)
    return builder.compile(checkpointer=checkpointer)


graph = build_graph()
