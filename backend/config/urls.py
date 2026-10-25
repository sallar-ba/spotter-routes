from django.urls import path

from planner import views

urlpatterns = [
    path("api/places", views.places),
    path("api/plan", views.plan),
]
