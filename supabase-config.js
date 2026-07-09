const SUPABASE_PROJECT_URL = "https://xcsjmehnnwimbyhalleb.supabase.co";
const SUPABASE_PROJECT_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhjc2ptZWhubndpbWJ5aGFsbGViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0OTAzMDgsImV4cCI6MjA5MjA2NjMwOH0.S23EhnHsmOkP1OfFLuoXTk1ITzqjYZ6BC3jWmpYaeps"; 

// Guardamos el cliente en 'supabaseApp'
const supabaseApp = window.supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_PROJECT_KEY);
