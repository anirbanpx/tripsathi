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
)


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

    builder.set_entry_point("persona_classification")
    builder.add_edge("persona_classification", "destination_intelligence")
    builder.add_edge("destination_intelligence", "candidate_gen")
    builder.add_edge("candidate_gen", "ranker")
    builder.add_edge("ranker", "plan_assembly")
    builder.add_edge("plan_assembly", "critic")
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

    conn = sqlite3.connect("checkpoints.db", check_same_thread=False)
    checkpointer = SqliteSaver(conn)
    return builder.compile(checkpointer=checkpointer)


graph = build_graph()
