from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from state import TripSathiState
from nodes import (
    persona_classification,
    destination_intelligence,
    plan_assembly,
    human_feedback,
    finalize,
    route_after_feedback,
)


def build_graph():
    builder = StateGraph(TripSathiState)

    builder.add_node("persona_classification", persona_classification)
    builder.add_node("destination_intelligence", destination_intelligence)
    builder.add_node("plan_assembly", plan_assembly)
    builder.add_node("human_feedback", human_feedback)
    builder.add_node("finalize", finalize)

    builder.set_entry_point("persona_classification")
    builder.add_edge("persona_classification", "destination_intelligence")
    builder.add_edge("destination_intelligence", "plan_assembly")
    builder.add_edge("plan_assembly", "human_feedback")
    builder.add_conditional_edges("human_feedback", route_after_feedback, {
        "plan_assembly": "plan_assembly",
        "finalize": "finalize",
        END: END,
    })
    builder.add_edge("finalize", END)

    checkpointer = MemorySaver()
    return builder.compile(checkpointer=checkpointer)


graph = build_graph()
