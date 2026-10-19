from django.contrib import admin
from django.urls import include, path
from racing import views

urlpatterns = [path('', views.dashboard, name='dashboard'), path('api/comparison/', views.comparison, name='comparison'), path('api/races/<int:race_id>/replay/', views.replay, name='replay'),path('bookmarks/', views.bookmark, name='bookmark'), path('signup/', views.signup, name='signup'), path('accounts/', include('django.contrib.auth.urls')), path('admin/', admin.site.urls)]
