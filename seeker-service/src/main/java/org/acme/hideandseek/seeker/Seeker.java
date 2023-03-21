package org.acme.hideandseek.seeker;

import io.quarkus.redis.datasource.RedisDataSource;
import io.quarkus.redis.datasource.geo.GeoUnit;
import io.quarkus.redis.datasource.list.KeyValue;
import io.quarkus.redis.datasource.list.ListCommands;
import io.quarkus.redis.datasource.pubsub.PubSubCommands;
import io.quarkus.runtime.Startup;
import org.acme.hideandseek.model.Event;
import org.acme.hideandseek.model.Player;
import org.jboss.logging.Logger;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;

@Startup
public class Seeker implements Runnable {
    private final static Logger LOGGER = Logger.getLogger("Seeker");
    private static final String KEY = "seeker";

    private final ListCommands<String, Event> queues;
    private Iterator<String> placesToVisit;
    private final RedisDataSource redis;
    private final PlaceRepository repository;

    // ---- Game session ----
    private Player player;
    private volatile String game;
    private String position;

    public Seeker(PlaceRepository repository, RedisDataSource redis) {
        this.redis = redis;
        this.repository = repository;

        this.queues = redis.list(Event.class);

        LOGGER.infof("Starting seeker");
        Thread.ofVirtual().start(this);
    }

    public void run() {
        while (true) {
            KeyValue<String, Event> kv = queues.blpop(Duration.ofSeconds(1), KEY);
            if (kv != null) {
                var event = kv.value;
                switch (event.kind) {
                    case GAME_STARTED -> {
                        var gse = event.as(Event.GameStartedEvent.class);
                        LOGGER.infof("Received game started event (%s). The seeker is %s", gse.gameId, gse.seeker.name());
                        var copy = new ArrayList<>(repository.getPlaceNames());
                        Collections.shuffle(copy);
                        this.placesToVisit = copy.iterator();
                        this.position = gse.startPosition;
                        this.player = gse.seeker;
                        this.game = gse.gameId;
                        goToPlace(placesToVisit.next());
                    }
                    case GAME_ENDED -> {
                        LOGGER.infof("The game is complete");
                        this.game = null;
                        this.player = null;
                        this.placesToVisit = null;
                    }
                    case SEEKER_ARRIVED -> {
                        this.position = event.as(Event.SeekerArrivedAtEvent.class).place;
                        redis.list(Event.SeekerAtPositionEvent.class).lpush(game, new Event.SeekerAtPositionEvent(game, this.position));
                        if (placesToVisit.hasNext()) {
                            goToPlace(placesToVisit.next());
                        }
                    }
                }
            }
        }
    }

    private void goToPlace(String destination) {
        var distance = redis.geo(String.class).geodist("places_geo", position, destination, GeoUnit.M);
        var duration = (int) (distance.orElse(0.0) / player.speed());
        LOGGER.infof("%s (seeker) wants to go from  %s to %s, the distance is %sm, it will take %sms", player.name(), position, destination, distance.orElse(0.0), duration);
        redis.list(Event.SeekerMoveEvent.class).lpush(game, new Event.SeekerMoveEvent(game, this.position, destination, duration, distance.orElse(0.0)));
        Thread.ofVirtual().start(() -> {
            try {
                Thread.sleep(duration);
                if (game != null) {
                    redis.list(Event.SeekerArrivedAtEvent.class).lpush(KEY, new Event.SeekerArrivedAtEvent(game, destination));
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
    }

}